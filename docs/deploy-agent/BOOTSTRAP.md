# Bootstrap a clean VPS for the stack deploy agent

This is **not** Hostinger-specific except where noted. The agent listens on HTTP (e.g. **8080**); put **TLS** in front with a real hostname so Supabase Edge and n8n trust the certificate.

## 1. Install Docker

Use your OS packages or Docker’s official install steps. On Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-$VERSION}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
```

Verify: `docker version` and `docker compose version`.

## 2. Node.js 20+ (for the agent)

Use [NodeSource](https://github.com/nodesource/distributions), `nvm`, or your distro’s packages.

## 3. Build and install the agent

From your machine or CI, copy the `deploy-agent` folder to the server (or clone this repo), then:

```bash
cd deploy-agent
npm run build
sudo mkdir -p /opt/deploy-agent
sudo cp -r dist /opt/deploy-agent/
# If you use a single-file copy, also copy package.json only if you add deps later.
```

Create `/etc/deploy-agent.env` (mode `600`, owned by root):

```bash
DEPLOY_AGENT_SECRET=your-long-random-secret-matching-supabase-stack-agent-token
DEPLOY_BASE_DIR=/docker
PORT=8080
```

**Important:** Paste the **same** secret into **Deploy bot → Stack template → Stack agent bearer token** in the app.

## 4. systemd unit

`/etc/systemd/system/deploy-agent.service`:

```ini
[Unit]
Description=OpenClaw stack deploy agent
After=docker.service network-online.target
Requires=docker.service

[Service]
EnvironmentFile=/etc/deploy-agent.env
WorkingDirectory=/opt/deploy-agent
ExecStart=/usr/bin/node /opt/deploy-agent/dist/index.js
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now deploy-agent
sudo systemctl status deploy-agent
```

`curl -sS http://127.0.0.1:8080/health` should return `{"ok":true}`.

## 5. TLS with Caddy (recommended)

Install [Caddy](https://caddyserver.com/docs/install), then e.g. `/etc/caddy/Caddyfile`:

```text
deploy.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Reload Caddy. Set **`agent_base_url`** in `bot_deployment_infra` to **`https://deploy.example.com`** (no path).

## 6. Hostinger post-install (optional)

You can register a **post-install script** via Hostinger’s API that only installs Docker + Node + copies the agent, then attach `post_install_script_id` when calling **setup** / **recreate**. See Hostinger’s article *Using Post-Install Scripts With Hostinger API*. Keep the script under **48 KB**; the **compose YAML** itself stays in Supabase and is delivered on each deploy—do not bake the full template into the script unless you want to.

## 7. Supabase and n8n

1. Run migrations so `deploy_compose_template` and `stack_agent_bearer_token` exist.
2. Superadmin: save **Stack template** YAML and **Stack agent bearer token** on Deploy bot.
3. Re-import **[docs/n8n/deploy-bot-workflow.json](../n8n/deploy-bot-workflow.json)** and set **`N8N_COMPOSE_FETCH_SECRET`** on n8n (match Supabase) if your flow predates **Fetch stack compose** / **`deploy-webhook-compose`**.

## One stack per VPS (default template)

The seeded compose uses host ports **80 / 81 / 443**. Only **one** such stack should run per public IP unless you change ports or share one reverse proxy across customers.
