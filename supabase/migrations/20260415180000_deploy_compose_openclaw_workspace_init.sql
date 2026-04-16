-- OpenClaw-only stack: bind-mounted workspace + init (chown + seed openclaw.json).
-- Nginx Proxy Manager is a separate template (docs/docker-templates/nginx-proxy-per-vps); deploy once per VPS.
-- Hostinger `environment` dotenv includes OPENCLAW_CONTROL_UI_ORIGIN (n8n derives from OPENCLAW_GATEWAY_URL).

update public.deploy_compose_template
set
  compose_yaml = $compose_tpl$
services:
  openclaw-workspace-init:
    image: busybox:1.36
    user: root
    volumes:
      - ./openclaw/workspace:/work
    env_file:
      - .env
    networks:
      - bot-bridge
    command:
      - sh
      - -c
      - |
        chown -R 1000:1000 /work
        O=$$OPENCLAW_CONTROL_UI_ORIGIN
        if [ -z "$$O" ]; then O=http://127.0.0.1:18789; fi
        printf '%s\n' "{\"gateway\":{\"controlUi\":{\"allowedOrigins\":[\"http://127.0.0.1:18789\",\"http://localhost:18789\",\"$$O\"]}}}" > /work/openclaw.json
        chown 1000:1000 /work/openclaw.json

  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: openclaw_bot
    restart: unless-stopped
    depends_on:
      openclaw-workspace-init:
        condition: service_completed_successfully
    networks:
      - bot-bridge
    env_file:
      - .env
    volumes:
      - ./openclaw/workspace:/home/node/.openclaw
    environment:
      - OPENCLAW_GATEWAY_BIND=0.0.0.0
      - OPENCLAW_GATEWAY_PORT=18789
      - OPENCLAW_GATEWAY_MODE=remote
      - OPENCLAW_GATEWAY_AUTH_MODE=token
      - OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1

networks:
  bot-bridge:
    external: true
$compose_tpl$,
  updated_at = now()
where id = 1;
