-- deploy_compose_template: Hostinger Docker API caps compose `content` at 8192 bytes — hook runs from OPENCLAW_STACK_HOOK_IMAGE (see packages/openclaw-stack-hook). Apply after 20260417120000 if that revision still had an oversized inline script.

update public.deploy_compose_template
set
  compose_yaml = $compose_tpl$# Hostinger VPS Docker API: `content` max 8192 chars — hook logic lives in image OPENCLAW_STACK_HOOK_IMAGE (see packages/openclaw-stack-hook).
# bot-bridge: docker network create bot-bridge
# NPM: WebSocket → openclaw_bot__…:18789; Post-deploy HTTPS → hook :18790 (agent_base_url).
services:
  openclaw-workspace-init:
    image: busybox:1.36
    container_name: openclaw_init__REPLACE_WITH_UNIQUE_NAME
    user: root
    volumes:
      - ./openclaw/workspace:/work
    networks:
      - bot-bridge
    command: ['sh', '-c', 'chown -R 1000:1000 /work']

  openclaw-post-deploy-hook:
    image: ${OPENCLAW_STACK_HOOK_IMAGE}
    container_name: openclaw_hook__REPLACE_WITH_UNIQUE_NAME
    restart: unless-stopped
    user: root
    depends_on:
      openclaw-workspace-init:
        condition: service_completed_successfully
    env_file:
      - .env
    volumes:
      - ./openclaw/workspace:/work
    networks:
      - bot-bridge
    ports:
      - "${OPENCLAW_STACK_HOOK_PORT:-18790}:18790"
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "require('http').get('http://127.0.0.1:18790/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))",
        ]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 15s

  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: openclaw_bot__REPLACE_WITH_UNIQUE_NAME
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
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - OPENROUTER_MODEL=${OPENROUTER_MODEL}

  openclaw-post-deploy:
    profiles:
      - post-deploy
    image: curlimages/curl:8.5.0
    user: root
    depends_on:
      openclaw-post-deploy-hook:
        condition: service_healthy
    env_file:
      - .env
    networks:
      - bot-bridge
    entrypoint: ['/bin/sh', '-c']
    command:
      - |
        set -e
        curl -fsS -X POST \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $$STACK_AGENT_BEARER_TOKEN" \
          -d '{"via":"compose-run"}' \
          "http://openclaw-post-deploy-hook:18790/post-deploy"

networks:
  bot-bridge:
    external: true
$compose_tpl$,
  updated_at = now()
where id = 1;
