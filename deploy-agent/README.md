# Deploy agent (VPS)

Small Node HTTP service on the **host** (not inside the OpenClaw compose stack):

- **`POST /deploy`** — writes `docker-compose.yml` and `.env` under `DEPLOY_BASE_DIR`, ensures Docker network **`bot-bridge`** exists, **`mkdir` + `chown`** on **`openclaw/workspace`** when the compose file bind-mounts it (no `openclaw.json` edits here), then **`docker compose -p <project> up -d`**.
- **`POST /post-deploy`** — same auth; body **`{ botDeploymentId, customerLabel }`**. Runs **`docker compose -p <project> --profile post-deploy run --rm openclaw-post-deploy`** so the stack’s merge job updates **`openclaw.json`** after OpenClaw has started. Timeout override: **`DEPLOY_POST_DEPLOY_TIMEOUT_MS`** (default 120000).

## Compose vs deploy-agent (Hostinger “3 containers”)

| Compose service | Stays running? | Role |
|-----------------|----------------|------|
| `openclaw-workspace-init` | **No** — exits after `chown` | One-shot; “Exited” in the panel is **success**. |
| `openclaw` | **Yes** | Gateway (`docker ps` shows this name). |
| `openclaw-post-deploy` | **No** — only when deploy-agent runs `compose run` | Merge script then exits; **not** a public HTTP target for NPM. |

Point **`agent_base_url` / NPM** at **this Node process** (e.g. `:8080`), not at the `openclaw-post-deploy` container.

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
