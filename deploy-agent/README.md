# Deploy agent (VPS)

Small Node HTTP service: **`POST /deploy`** writes `docker-compose.yml` and `.env` under `DEPLOY_BASE_DIR`, ensures Docker network **`bot-bridge`** exists, then runs **`docker compose -p <project> up -d`**.

If the compose YAML bind-mounts **`openclaw/workspace`** (recommended for OpenClaw), the agent creates that directory and runs **`chown -R`** so the image `node` user can write `openclaw.json`. Override with **`OPENCLAW_WORKSPACE_CHOWN`** (default `1000:1000`). The agent must run as **root** (or another user allowed to `chown`).

- **Auth:** `Authorization: Bearer <DEPLOY_AGENT_SECRET>` (same value as **Stack agent bearer token** in Supabase).
- **Source:** Built from this package; run on the VPS (systemd) behind **Caddy** or another TLS reverse proxy. See [docs/deploy-agent/BOOTSTRAP.md](../docs/deploy-agent/BOOTSTRAP.md).

```bash
cd deploy-agent
npm install
npm run build
DEPLOY_AGENT_SECRET='…' DEPLOY_BASE_DIR=/docker PORT=8080 node dist/index.js
```

The default compose template in Supabase assumes **one stack per VPS** (published ports 80/81/443). Running many stacks on one host requires port and naming changes.
