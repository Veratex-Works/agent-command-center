-- Embed OPENROUTER_API_KEY into openclaw.json `env` (OpenClaw provider docs) and pass it explicitly
-- to the gateway container so OpenRouter completions work (fixes empty / incomplete turns when only .env was used).

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
        O=$$(printf '%s' "$$OPENCLAW_CONTROL_UI_ORIGIN" | tr -d '\r\n')
        if [ -z "$$O" ]; then O=http://127.0.0.1:18789; fi
        MR=$$(printf '%s' "$$OPENROUTER_MODEL" | tr -d '\r\n')
        if [ -z "$$MR" ]; then MR=openrouter/openai/gpt-4o-mini; fi
        case "$$MR" in openrouter/*) M="$$MR";; *) M="openrouter/$$MR";; esac
        TP_RAW=$$(printf '%s' "$$OPENCLAW_GATEWAY_TRUSTED_PROXIES" | tr -d '\r\n')
        TP_MID=""
        if [ -n "$$TP_RAW" ]; then
          TP_MID=',"trustedProxies":['
          sep=""
          for ip in $$(printf '%s' "$$TP_RAW" | tr ',' ' '); do
            [ -z "$$ip" ] && continue
            TP_MID="$$TP_MID$$sep\"$$ip\""
            sep=","
          done
          TP_MID="$$TP_MID]"
        fi
        KEY_RAW=$$(printf '%s' "$$OPENROUTER_API_KEY" | tr -d '\r\n')
        KEY_ESC=$$(printf '%s' "$$KEY_RAW" | sed 's/\\/\\\\/g;s/"/\\"/g')
        {
          if [ -n "$$KEY_RAW" ]; then
            printf '%s' '{"env":{"OPENROUTER_API_KEY":"'
            printf '%s' "$$KEY_ESC"
            printf '%s' '"},"gateway":{"controlUi":{"allowedOrigins":["http://127.0.0.1:18789","http://localhost:18789","'
          else
            printf '%s' '{"gateway":{"controlUi":{"allowedOrigins":["http://127.0.0.1:18789","http://localhost:18789","'
          fi
          printf '%s' "$$O"
          printf '%s' '"],"dangerouslyDisableDeviceAuth":true}'
          printf '%s' "$$TP_MID"
          printf '%s' '},"agents":{"defaults":{"model":'
          printf '"%s"' "$$M"
          printf '%s' ',"models":{'
          printf '"%s"' "$$M"
          printf '%s' ':{}}}}}'
          printf '\n'
        } > /work/openclaw.json
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
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - OPENROUTER_MODEL=${OPENROUTER_MODEL}

networks:
  bot-bridge:
    external: true
$compose_tpl$,
  updated_at = now()
where id = 1;
