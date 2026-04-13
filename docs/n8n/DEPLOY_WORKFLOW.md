# n8n: OpenClaw deploy workflow

The app’s **deploy-bot** Edge Function `POST`s JSON to your n8n **Webhook** node. Shape:

```json
{
  "botDeploymentId": "uuid",
  "customerLabel": "string",
  "env": { "OPENCLAW_GATEWAY_URL": "…", "…": "…" },
  "updateStackOnly": false,
  "provider": {
    "vpsApiBaseUrl": "https://…",
    "vpsApiToken": "…"
  },
  "infra": {
    "providerVmId": "string | null",
    "vpsPublicIpv4": "string | null",
    "agentBaseUrl": "https://host:port | null",
    "lastDeployedAt": "ISO | null",
    "lastProvisionedAt": "ISO | null"
  }
}
```

- **`env`**: stack/env for Docker (from `bot_deployments.deployment_env` only).
- **`provider`**: from `deploy_provider_settings` (superadmin saves on Deploy bot page).
- **`infra`**: from `bot_deployment_infra` (updated by **deploy-bot-callback** after provision/deploy).
- **`updateStackOnly`**: when `true`, **do not** create a new VPS; call your VPS HTTP agent using `infra.agentBaseUrl` (or build URL from `infra.vpsPublicIpv4`).

## 1. Webhook → Map payload

Keep a **Set** node that normalizes `body.*` onto the root (as in `deploy-bot-workflow.json`).

## 2. Branch on `updateStackOnly`

Add an **IF** (or **Switch**) node immediately after mapping:

- **True** (`updateStackOnly === true`): go to **“Deploy stack via agent”** (HTTP to `{{ $json.infra.agentBaseUrl }}` or your convention).
- **False**: go to **“Provision VPS”** (HTTP to `{{ $json.provider.vpsApiBaseUrl }}` + path from Hostinger docs), then poll/wait until you have VM id + public IP.

Use **Authorization: Bearer {{ $json.provider.vpsApiToken }}** on provider calls when the token is present (or use n8n credentials and ignore the body token).

## 3. After provision (full path only)

When the provider returns a VM id and IP:

1. Optionally call **deploy-bot-callback** (see below) with `providerVmId`, `vpsPublicIpv4`, `touchLastProvisioned: true`.
2. Continue to install Docker / set `agentBaseUrl` if your agent URL is known (e.g. `https://<ip>:8443/deploy`).
3. Call your **static compose** agent with `{ env }` (and any fixed template version id your agent expects).

## 4. Deploy stack (HTTP agent)

Your agent should:

- Use a **fixed** `docker-compose.yml` template on the server or baked into your agent image.
- Apply **`env`** from the webhook JSON as a **`.env`** file next to the compose (your OpenClaw service uses `env_file: .env`).
- Run **`docker compose up -d`** (or equivalent) in that directory.
- Return JSON success/failure to n8n.

The Edge Function does **not** send `docker-compose.yml` content; only `env` and flags. Template changes are versioned in your agent or git, not in Supabase.

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

**Suggested agent request body** (n8n HTTP node → your agent):

```json
{
  "botDeploymentId": "uuid",
  "customerLabel": "string",
  "env": { "OPENCLAW_GATEWAY_URL": "…", "OPENCLAW_GATEWAY_TOKEN": "…" }
}
```

Protect the agent with HTTPS + a static bearer token or mTLS; store the token only in n8n credentials, not in Supabase.

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

1. **Supabase** — Migration is applied; confirm `deploy_provider_settings` has row `id = 1` and you can save **VPS API base URL** + token on Deploy bot.
2. **Edge Functions** — Deploy `deploy-bot` and `deploy-bot-callback`; set secrets: `N8N_DEPLOY_WEBHOOK_URL`, `N8N_DEPLOY_WEBHOOK_TEST_URL` (optional), `DEPLOY_BOT_CALLBACK_SECRET`, plus usual `SUPABASE_*` for local serve.
3. **VPS deploy agent** — Small HTTPS service (or SSH script) that: ensures `bot-bridge` → writes `.env` from JSON `env` → writes fixed `docker-compose.yml` → `docker compose up -d` → returns 200/500. Record its URL as **`agent_base_url`** via **deploy-bot-callback** after first provision so **`updateStackOnly`** runs work.
4. **n8n** — Extend **Map payload** to pass through `updateStackOnly`, `provider`, `infra` from `body` (same pattern as `env`). Add **IF** on `updateStackOnly`. Full path: provision → callback (VM/IP/agent URL) → call agent. Stack-only path: call agent using `infra.agentBaseUrl`. On success/failure, call **deploy-bot-callback** again with `touchLastDeployed` / `deploymentStatus`.
5. **First end-to-end test** — Save provider settings, create a draft with env filled, deploy with **Update stack only** unchecked; after VPS exists and agent URL is stored, toggle **Update stack only** and redeploy to verify the branch.
