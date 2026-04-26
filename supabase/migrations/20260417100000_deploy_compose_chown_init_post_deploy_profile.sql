-- deploy_compose_template: openclaw-workspace-init = busybox chown only; openclaw-post-deploy (profile post-deploy) holds JSON merge (run via deploy-agent POST /post-deploy or compose run).

update public.deploy_compose_template
set
  compose_yaml = $compose_tpl$# OpenClaw gateway — copy per bot; set a unique container_name.
# Shared network `bot-bridge` must exist: docker network create bot-bridge
# NPM forwards WebSocket to container_name:18789.
#
# openclaw-workspace-init: Busybox one-shot — chown bind mount for UID/GID 1000 only (no openclaw.json edits).
# Lets OpenClaw start and write its own config before any merge.
#
# openclaw-post-deploy (profile post-deploy): NOT started by `docker compose up -d`. Run after OpenClaw is up:
#   docker compose -p <project> --profile post-deploy run --rm openclaw-post-deploy
# Or use the app “Post-deploy config” button → n8n → deploy-agent POST /post-deploy.
# Merges OPENCLAW_BASE_JSON_B64, OPENROUTER_API_KEY, gateway.auth from OPENCLAW_GATEWAY_TOKEN, controlUi
# origins, trustedProxies union, optional agents.defaults.model when OPENROUTER_MODEL is set.
#
# Required in .env for post-deploy: same keys as before (OPENROUTER_API_KEY, OPENCLAW_GATEWAY_TOKEN, …).
# Optional: OPENCLAW_GATEWAY_TRUSTED_PROXIES, OPENROUTER_MODEL, OPENCLAW_BASE_JSON_B64 (from Supabase UI).
#
# Security: dangerouslyDisableDeviceAuth in post-deploy merge; prefer pairing for high-threat deployments.
#
# CLI on the VPS: docker exec -e OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789 <container> openclaw <cmd>

services:
  openclaw-workspace-init:
    image: busybox:1.36
    user: root
    volumes:
      - ./openclaw/workspace:/work
    networks:
      - bot-bridge
    command: ['sh', '-c', 'chown -R 1000:1000 /work']

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
    image: node:20-alpine
    user: root
    volumes:
      - ./openclaw/workspace:/work
    env_file:
      - .env
    networks:
      - bot-bridge
    command:
      - node
      - -e
      - |
        const fs = require('fs');
        const path = require('path');
        const target = '/work/openclaw.json';
        const uid = 1000;
        const gid = 1000;
        function chownR(p) {
          fs.chownSync(p, uid, gid);
          const st = fs.statSync(p);
          if (!st.isDirectory()) return;
          for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
            chownR(path.join(p, ent.name));
          }
        }
        function expandTrustAddrs(list) {
          const s = new Set();
          const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
          for (const raw of list) {
            const ip = String(raw).trim();
            if (!ip) continue;
            s.add(ip);
            if (ipv4.test(ip)) s.add('::ffff:' + ip);
          }
          return [...s];
        }
        function normalizeTrustedProxyEntry(raw) {
          let s = String(raw).trim();
          if (!s) return '';
          s = s.replace(/^https?:\/\//i, '');
          const slash = s.indexOf('/');
          if (slash >= 0) s = s.slice(0, slash);
          const ipv4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/;
          const m = s.match(ipv4Port);
          if (m) return m[1];
          return s;
        }
        const trim = (s) => (s || '').trim().replace(/\r|\n/g, '');
        const O = trim(process.env.OPENCLAW_CONTROL_UI_ORIGIN) || 'http://127.0.0.1:18789';
        const modelRaw = trim(process.env.OPENROUTER_MODEL);
        const TP_RAW = trim(process.env.OPENCLAW_GATEWAY_TRUSTED_PROXIES);
        const trustedFromEnv = TP_RAW
          ? [...new Set(TP_RAW.split(',').map((s) => normalizeTrustedProxyEntry(s)).filter(Boolean))]
          : [];
        const key = trim(process.env.OPENROUTER_API_KEY);
        const gatewayToken = trim(process.env.OPENCLAW_GATEWAY_TOKEN);
        let base = {};
        try {
          if (fs.existsSync(target)) {
            base = JSON.parse(fs.readFileSync(target, 'utf8'));
            if (!base || typeof base !== 'object') base = {};
          }
        } catch (_) {
          base = {};
        }
        const b64 = trim(process.env.OPENCLAW_BASE_JSON_B64);
        if (b64) {
          try {
            const dec = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
            if (dec && typeof dec === 'object' && !Array.isArray(dec)) {
              base = { ...dec, ...base };
            }
          } catch (_) {}
        }
        const envIn = base.env && typeof base.env === 'object' ? base.env : {};
        const gwIn = base.gateway && typeof base.gateway === 'object' ? base.gateway : {};
        const cuiIn = gwIn.controlUi && typeof gwIn.controlUi === 'object' ? gwIn.controlUi : {};
        const agIn = base.agents && typeof base.agents === 'object' ? base.agents : {};
        const defIn = agIn.defaults && typeof agIn.defaults === 'object' ? agIn.defaults : {};
        const origins = new Set([
          ...(Array.isArray(cuiIn.allowedOrigins) ? cuiIn.allowedOrigins : []),
          'http://127.0.0.1:18789',
          'http://localhost:18789',
          'https://bot.demo-nelkode.co.za',
          'http://localhost:5173',
          O,
        ]);
        const out = { ...base };
        out.env = { ...envIn, ...(key ? { OPENROUTER_API_KEY: key } : {}) };
        out.gateway = {
          ...gwIn,
          controlUi: {
            ...cuiIn,
            allowedOrigins: [...origins],
            dangerouslyDisableDeviceAuth: true,
          },
        };
        const authMerged = {
          ...(out.gateway.auth && typeof out.gateway.auth === 'object' ? out.gateway.auth : {}),
          ...(gatewayToken ? { token: gatewayToken } : {}),
        };
        if (Object.keys(authMerged).length) {
          out.gateway.auth = authMerged;
        }
        const existingTp = Array.isArray(gwIn.trustedProxies)
          ? gwIn.trustedProxies.map((x) => normalizeTrustedProxyEntry(String(x))).filter(Boolean)
          : [];
        const tpMerged = [...new Set([...existingTp, ...trustedFromEnv])].filter(Boolean);
        if (tpMerged.length) {
          const cleaned = [...new Set(tpMerged.map(normalizeTrustedProxyEntry).filter(Boolean))];
          out.gateway.trustedProxies = expandTrustAddrs(cleaned);
        }
        if (modelRaw) {
          let M = modelRaw;
          if (!M.startsWith('openrouter/')) M = 'openrouter/' + M;
          const modelsIn = defIn.models && typeof defIn.models === 'object' ? { ...defIn.models } : {};
          if (!modelsIn[M]) modelsIn[M] = {};
          out.agents = {
            ...agIn,
            defaults: {
              ...defIn,
              model: M,
              models: modelsIn,
            },
          };
        }
        const tmp = target + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(out) + '\n');
        fs.renameSync(tmp, target);
        fs.chownSync(target, uid, gid);
        chownR('/work');

networks:
  bot-bridge:
    external: true
$compose_tpl$,
  updated_at = now()
where id = 1;
