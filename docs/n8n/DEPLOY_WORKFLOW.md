# n8n: OpenClaw deploy workflow

The app’s **deploy-bot** Edge Function `POST`s JSON to your n8n **Webhook** node. Shape:

```json
{
  "botDeploymentId": "uuid",
  "customerLabel": "string",
  "assignedUserId": "uuid | null",
  "composeFetchUrl": "https://<project>.supabase.co/functions/v1/deploy-webhook-compose",
  "env": { "OPENCLAW_GATEWAY_URL": "…", "…": "…" },
  "openclawBaseJson": null,
  "updateStackOnly": false,
  "stackAgent": { "bearerToken": "string | null" },
  "provider": {
    "vpsApiBaseUrl": "https://…",
    "vpsApiToken": "…"
  },
  "infra": {
    "providerVmId": "string | null",
    "vpsPublicIpv4": "string | null",
    "agentBaseUrl": "https://host | null",
    "lastDeployedAt": "ISO | null",
    "lastProvisionedAt": "ISO | null"
  }
}
```

The webhook body is **kept small** on purpose: the full **docker-compose** text is **not** inlined. n8n calls **`deploy-webhook-compose`** with **`N8N_COMPOSE_FETCH_SECRET`** (same value in Supabase Edge secrets and in the **n8n** server environment) and receives `{ "composeYaml": "…" }`.

- **`assignedUserId`**: `bot_deployments.assigned_user_id` (client assignee). n8n uses it for **`project_name`** slug when set; otherwise falls back to **`customerLabel`** / deployment id.
- **`env`**: stack/env for Docker (from `bot_deployments.deployment_env` only).
- **`openclawBaseJson`**: optional object from `bot_deployments.openclaw_base_json`; the workflow encodes it as **`OPENCLAW_BASE_JSON_B64`** in the dotenv string. The **`openclaw-post-deploy`** service (Compose profile `post-deploy`) merges it into `openclaw.json` after OpenClaw has started — triggered from the app **Post-deploy** button via Edge Function **`deploy-post-openclaw`** and **[post-deploy-openclaw-workflow.json](post-deploy-openclaw-workflow.json)** (`N8N_POST_DEPLOY_WEBHOOK_URL` in Supabase).
- **`composeFetchUrl`**: Edge Function URL; workflow node **Fetch stack compose** `POST`s `{ secret, botDeploymentId }` and merges **`composeYaml`** into the item before Hostinger. Template text still lives in **`deploy_compose_template`** (superadmin **Stack template**).
- **`provider.vpsApiBaseUrl`**: must be the **API root** (no trailing slash), e.g. `https://developers.hostinger.com/api/vps/v1`, so n8n can append `/virtual-machines/{id}/docker`.
- **`infra.providerVmId`**: required before **Hostinger Docker** deploy; set after provision via **deploy-bot-callback** or manually.
- **`stackAgent`**: optional; only for a custom **self-hosted deploy-agent** path (not used by the default Hostinger Docker workflow).
- **`updateStackOnly`**: when `true`, skip **Provision**; still requires **`providerVmId`** for Hostinger Docker API.

## 1. Webhook → Map payload → Fetch stack compose → Merge stack compose

1. **Set** node normalizes `body.*` onto the root (including **`composeFetchUrl`**).
2. **HTTP Request** `POST` **`composeFetchUrl`** with JSON body  
   `{ "secret": "<from $env.N8N_COMPOSE_FETCH_SECRET>", "botDeploymentId": "<from item>" }`.
3. **Code** node **Merge stack compose** spreads the Map payload and sets **`composeYaml`** from the Edge response.

Set **`N8N_COMPOSE_FETCH_SECRET`** on your n8n instance to the same string as the Supabase secret for **`deploy-webhook-compose`**. Deploy that Edge Function (`verify_jwt = false`; auth is the shared secret in the JSON body).

## 2. Branch on `updateStackOnly`

After **Merge stack compose** (see [deploy-bot-workflow.json](deploy-bot-workflow.json)):

- **True**: **Build Hostinger Docker payload** (Code) → **Hostinger Docker API** `POST {vpsApiBaseUrl}/virtual-machines/{providerVmId}/docker` with Bearer **`provider.vpsApiToken`**.
- **False**: **Provision new VPS** (your Hostinger provision URL) → same **Code** + **Hostinger Docker** chain.

Use **Bearer `provider.vpsApiToken`** on the **Docker API** node (same token family as provision).

## 3. After provision (full path only)

Persist **`providerVmId`** (and optional IP) before the Docker step:

1. Call **deploy-bot-callback** with `providerVmId`, `vpsPublicIpv4`, `touchLastProvisioned: true` (or set **`infra.provider_vm_id`** in Supabase manually).
2. Without **`providerVmId`**, the **Code** node throws — Hostinger Docker URL cannot be built.

## 4. Deploy stack (Hostinger Docker API — default)

The **Code** node reads **`$('Merge stack compose').first().json`** (and the Webhook for fallbacks), builds:

- **`content`** ← **`composeYaml`** (loaded in the merge step)
- **`environment`** ← multiline string from **`env`** (dotenv-style, sorted keys)
- **`project_name`** ← `openclaw-{slug}__{deploymentId}` where **slug** prefers **`assignedUserId`**, else **`customerLabel`**
- **`dockerApiUrl`** ← `{vpsApiBaseUrl}/virtual-machines/{providerVmId}/docker`

Then **HTTP Request** posts JSON `{ project_name, content, environment }`.

### 4.0 Hostinger `content` size (8192 characters)

Hostinger’s `POST …/virtual-machines/{id}/docker` body rejects **`content`** (the compose YAML) larger than **8192** bytes. The stack template keeps the hook out of inline `node -e` scripts: **`openclaw-post-deploy-hook`** uses **`image: ${OPENCLAW_STACK_HOOK_IMAGE}`**. Build and push the image from **`packages/openclaw-stack-hook`** (`Dockerfile` + `server.mjs`) to your registry, then either:

- put **`OPENCLAW_STACK_HOOK_IMAGE`** (e.g. `ghcr.io/your-org/openclaw-stack-hook:1`) on each deployment’s **`deployment_env`**, or  
- set Supabase Edge secret **`DEFAULT_OPENCLAW_STACK_HOOK_IMAGE`** to that image reference and **redeploy** the **`deploy-bot`** Edge Function — **`deploy-bot`** injects it when **`deployment_env`** does not already define the key.

### 4.0 Optional: self-hosted deploy-agent

Alternatively you can use **[deploy-agent](../../deploy-agent/README.md)** on the VPS (`POST /deploy`) instead of Hostinger’s Docker API; that path is not in the default JSON export anymore.

### 4.0.1 Post-deploy (`openclaw.json` merge)

The stack template adds **`openclaw-post-deploy-hook`** (always on): container **`OPENCLAW_STACK_HOOK_IMAGE`** listens on **port 18790** and implements **`POST /post-deploy`** (Bearer **`STACK_AGENT_BEARER_TOKEN`**, same value as **Stack agent bearer token** in Supabase). The **`deploy-bot`** Edge Function injects that bearer token (and optionally the hook image via **`DEFAULT_OPENCLAW_STACK_HOOK_IMAGE`**) into the Hostinger **`environment`** string when missing from **`deployment_env`**.

After the stack is **live** and OpenClaw has written its config:

1. **Nginx Proxy Manager (or similar)** on the VPS: add a **Proxy Host** whose **upstream** is **`<vps-lan-ip>:18790`** (or the published host port if you mapped `OPENCLAW_STACK_HOOK_PORT`), TLS on the public hostname you want (e.g. `https://hooks.customer.example`).
2. In **Supabase** (Table Editor or SQL), set **`bot_deployment_infra.agent_base_url`** for that deployment to that **HTTPS origin only** (no path), e.g. `https://hooks.customer.example`.
3. Superadmin: **Deploy bot → Post-deploy** on the row. Edge **`deploy-post-openclaw`** → n8n → **`POST {agent_base_url}/post-deploy`** with the bearer token.

If you **do** run **deploy-agent** on the host instead, set **`agent_base_url`** to that agent’s HTTPS origin; the agent still runs **`docker compose --profile post-deploy run --rm openclaw-post-deploy`**, which is now a thin **`curl`** into the hook (merge logic stays in one place).

Re-import the workflow and set **`N8N_POST_DEPLOY_WEBHOOK_URL`** alongside the existing deploy webhook secrets.

**Post-deploy not firing (checklist)**

1. **Edge Function deployed** — `supabase functions deploy deploy-post-openclaw` (Cloud Dashboard shows it under Edge Functions). Until it exists, the app button hits a missing URL / relay error.
2. **Secret + redeploy** — Add **`N8N_POST_DEPLOY_WEBHOOK_URL`** in **Project Settings → Edge Functions → Secrets** (exact name), then **redeploy** `deploy-post-openclaw`. New secrets are not always visible to already-running revisions.
3. **`agent_base_url`** — Must be the **HTTPS origin** that reaches **`POST /post-deploy`** (NPM → **`openclaw-post-deploy-hook:18790`**, or self-hosted deploy-agent). **Do not** put the Hostinger developers API URL here (e.g. `https://developers.hostinger.com/api/...`); that causes n8n to return **404**. Without a correct URL the Edge returns **400** or the UI disables **Post-deploy**.
4. **n8n URL** — Use the **production** webhook URL from the active workflow (often **Webhook** node → **Production URL**), not the test URL, unless you set the secret to the test URL on purpose.
5. **Stack agent token** — **`stack_agent_bearer_token`** in `deploy_provider_settings` must match **`STACK_AGENT_BEARER_TOKEN`** inside the stack’s `.env` (injected on deploy when missing) and the hook’s **`Authorization: Bearer`** header; if you use deploy-agent on the host, it must still match **`DEPLOY_AGENT_SECRET`** there.

### 4.1 Network prerequisite (`bot-bridge`)

Your compose uses an **external** network:

```yaml
networks:
  bot-bridge:
    external: true
```

Before the first `docker compose up -d`, the network must exist. Run this on the VPS **every time before compose** (idempotent):

```bash
docker network inspect bot-bridge >/dev/null 2>&1 || docker network create bot-bridge
```

Your HTTP agent should execute that (or equivalent) before writing files and bringing the stack up.

### 4.2 Reference stack (Nginx Proxy Manager + OpenClaw)

Planned layout (adjust paths/ports only in your template, not per customer):

```yaml
services:
  nginx-proxy:
    image: 'jc21/nginx-proxy-manager:latest'
    container_name: nginx-proxy
    restart: always
    ports:
      - 80:80
      - 81:81
      - 443:443
    volumes:
      - ./nginx_data:/data
      - ./letsencrypt:/etc/letsencrypt
    networks:
      - bot-bridge

  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: openclaw_bot
    restart: unless-stopped
    networks:
      - bot-bridge
    env_file:
      - .env
    volumes:
      - openclaw_data:/home/node/.openclaw
    environment:
      - OPENCLAW_GATEWAY_BIND=0.0.0.0
      - OPENCLAW_GATEWAY_PORT=18789
      - OPENCLAW_GATEWAY_MODE=remote
      - OPENCLAW_GATEWAY_AUTH_MODE=token
      - OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1

volumes:
  openclaw_data:

networks:
  bot-bridge:
    external: true
```

**After deploy:** in NPM’s admin UI (port **81**), add a **Proxy Host** that terminates TLS and forwards WebSocket to `openclaw_bot:18789` (or the container name on `bot-bridge`). Point your app’s gateway URL at the public host you configure there. Automating NPM via API is optional later.

**Agent request body** (n8n HTTP node → deploy agent):

```json
{
  "botDeploymentId": "uuid",
  "customerLabel": "string",
  "env": { "OPENCLAW_GATEWAY_URL": "…", "OPENCLAW_GATEWAY_TOKEN": "…" },
  "updateStackOnly": false,
  "composeYaml": "services:\\n  …"
}
```

Protect the agent with **HTTPS** (e.g. Caddy in front). The bearer token is stored in **Supabase** (`stack_agent_bearer_token`) and forwarded in the webhook so n8n does not need a separate credential store for it (still treat the VPS `DEPLOY_AGENT_SECRET` as sensitive).

## 5. Callback to Supabase (`deploy-bot-callback`)

Deploy this Edge Function and set secret **`DEPLOY_BOT_CALLBACK_SECRET`** (same value in n8n).

**URL:** `https://<project-ref>.supabase.co/functions/v1/deploy-bot-callback`

**Headers:**

- `Content-Type: application/json`
- `x-deploy-callback-secret: <DEPLOY_BOT_CALLBACK_SECRET>`

**Body examples:**

After provision:

```json
{
  "botDeploymentId": "{{ $json.botDeploymentId }}",
  "providerVmId": "…",
  "vpsPublicIpv4": "…",
  "agentBaseUrl": "https://…",
  "touchLastProvisioned": true
}
```

After successful stack update:

```json
{
  "botDeploymentId": "{{ $json.botDeploymentId }}",
  "touchLastDeployed": true,
  "deploymentStatus": "live"
}
```

On failure:

```json
{
  "botDeploymentId": "{{ $json.botDeploymentId }}",
  "deploymentStatus": "failed"
}
```

Allowed `deploymentStatus` values: `draft`, `deploying`, `live`, `failed`.

## 6. One workflow for all clients

No per-client edits: every run is keyed by **`botDeploymentId`**. Reuse is entirely driven by **`updateStackOnly`** + **`infra`** populated by callbacks.

## 7. Optional UX alignment with the app

The React app may still mark a row `live` when the n8n webhook returns HTTP 2xx. For stricter semantics, stop updating status in the app and rely on **callback** `deploymentStatus` only (future tweak).

## 8. What to do next (checklist)

1. **Supabase** — Migrations applied; save **VPS API** root URL (e.g. `…/api/vps/v1`) + token; **Stack template** (`deploy_compose_template`). Ensure **`bot_deployment_infra.provider_vm_id`** is set for each deployment before Hostinger Docker deploy.
2. **Edge Functions** — Deploy `deploy-bot`, `deploy-bot-callback`, and **`deploy-webhook-compose`**; set secrets: `N8N_DEPLOY_WEBHOOK_URL`, `N8N_DEPLOY_WEBHOOK_TEST_URL` (optional), `DEPLOY_BOT_CALLBACK_SECRET`, **`N8N_COMPOSE_FETCH_SECRET`**, plus usual `SUPABASE_*` for local serve.
3. **Hostinger** — VM exists; API token can call **`POST …/virtual-machines/{id}/docker`**. After provision, persist **`provider_vm_id`** via callback or SQL.
4. **n8n** — Import **[deploy-bot-workflow.json](deploy-bot-workflow.json)**; set environment **`N8N_COMPOSE_FETCH_SECRET`** to match Supabase. **Fetch stack compose** → **Merge stack compose**, then **Code** builds Hostinger body; **HTTP** calls Docker API with **`provider.vpsApiToken`**. Branch on **`updateStackOnly`**.
5. **First end-to-end test** — Assign a client (optional, for **`assignedUserId`** slug); fill **env**; deploy with **Update stack only** on only if **`provider_vm_id`** is already set.
