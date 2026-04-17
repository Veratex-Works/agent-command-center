-- openclaw-workspace-init: merge gateway.auth.token from OPENCLAW_GATEWAY_TOKEN when set (with existing auth keys).
-- Deploy agent seeds openclaw/workspace/openclaw.json if missing (see deploy-agent/src/index.ts); paste updated compose from docs into Deploy bot UI or apply migrations.

update public.deploy_compose_template
set
  compose_yaml = $compose_tpl$
services:
  openclaw-workspace-init:
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
        chownR('/work');
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
        const O = trim(process.env.OPENCLAW_CONTROL_UI_ORIGIN) || 'http://127.0.0.1:54283';
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
        const envIn = base.env && typeof base.env === 'object' ? base.env : {};
        const gwIn = base.gateway && typeof base.gateway === 'object' ? base.gateway : {};
        const cuiIn = gwIn.controlUi && typeof gwIn.controlUi === 'object' ? gwIn.controlUi : {};
        const agIn = base.agents && typeof base.agents === 'object' ? base.agents : {};
        const defIn = agIn.defaults && typeof agIn.defaults === 'object' ? agIn.defaults : {};
        const origins = new Set([
          ...(Array.isArray(cuiIn.allowedOrigins) ? cuiIn.allowedOrigins : []),
          'http://127.0.0.1:54283',
          'http://localhost:54283',
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
      - OPENCLAW_GATEWAY_PORT=54283
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
