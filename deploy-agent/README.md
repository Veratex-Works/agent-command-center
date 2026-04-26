# Deploy agent (VPS)

Small Node HTTP service on the **host** (not inside the OpenClaw compose stack):

- **`POST /deploy`** — writes `docker-compose.yml` and `.env` under `DEPLOY_BASE_DIR`, ensures Docker network **`bot-bridge`** exists, **`mkdir` + `chown`** on **`openclaw/workspace`** when the compose file bind-mounts it (no `openclaw.json` edits here), then **`docker compose -p <project> up -d`**.
- **`POST /post-deploy`** — same auth; body **`{ botDeploymentId, customerLabel }`**. Runs **`docker compose -p <project> --profile post-deploy run --rm openclaw-post-deploy`** so the stack’s merge job updates **`openclaw.json`** after OpenClaw has started. Timeout override: **`DEPLOY_POST_DEPLOY_TIMEOUT_MS`** (default 120000).

## Compose vs deploy-agent (Hostinger “one project, several containers”)

| Compose service | Stays running? | Role |
|-----------------|----------------|------|
| `openclaw-workspace-init` | **No** — exits after `chown` | One-shot; “Exited” in the panel is **success**. |
| `openclaw` | **Yes** | Gateway (`docker ps` shows this name). |
| `openclaw-post-deploy-hook` | **Yes** | Image from **`OPENCLAW_STACK_HOOK_IMAGE`** (see `packages/openclaw-stack-hook`); `POST /post-deploy` (Bearer `STACK_AGENT_BEARER_TOKEN`); port from **`STACK_HOOK_PORT`** in the stack `.env` (default **18790**) for NPM when you **do not** run deploy-agent on the host. Hostinger’s compose **`content`** limit is **8192** chars — hook logic must live in that image, not inline in YAML. |
| `openclaw-post-deploy` | **No** — `compose run` (profile `post-deploy`) | Thin `curl` to the hook; used by deploy-agent’s `POST /post-deploy` or manual CLI. |

If you use **only** Hostinger + n8n (no deploy-agent on the VPS), set **`bot_deployment_infra.agent_base_url`** to the **HTTPS origin** that proxies to the hook’s **published host port** (from **`STACK_HOOK_PORT`** in the stack `.env`, default **18790**; same bearer as **Stack agent bearer token**). If you run **deploy-agent** on the host, point **`agent_base_url`** at that Node process (e.g. `:8080`) instead; it still shells out to `docker compose … run openclaw-post-deploy`, which calls the hook internally.

**Inspect `bot-bridge` on the VPS:**

```bash
docker network inspect bot-bridge
```

**Per-stack containers (from the project directory under `DEPLOY_BASE_DIR`):**

```bash
cd /docker/openclaw-<slug>__<deployment-uuid>
docker compose ps -a
```

Override workspace ownership with **`OPENCLAW_WORKSPACE_CHOWN`** (default `1000:1000`). The agent must run as **root** (or another user allowed to `chown`).

- **Auth:** `Authorization: Bearer <DEPLOY_AGENT_SECRET>` (same value as **Stack agent bearer token** in Supabase).
- **Source:** Built from this package; run on the VPS (systemd) behind **Caddy**, **Nginx Proxy Manager**, or another TLS reverse proxy. See [docs/deploy-agent/BOOTSTRAP.md](../docs/deploy-agent/BOOTSTRAP.md).

```bash
cd deploy-agent
npm install
npm run build
DEPLOY_AGENT_SECRET='…' DEPLOY_BASE_DIR=/docker PORT=8080 node dist/index.js
```

The default compose template in Supabase assumes **one stack per VPS** (published ports 80/81/443). Running many stacks on one host requires port and naming changes.
