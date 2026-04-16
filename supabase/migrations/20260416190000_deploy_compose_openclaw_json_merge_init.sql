-- openclaw-workspace-init: merge env/gateway/agents patches into existing openclaw.json instead of
-- overwriting with a minimal printf JSON (preserves gateway-managed keys and user edits).

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
        const trim = (s) => (s || '').trim().replace(/\r|\n/g, '');
        const O = trim(process.env.OPENCLAW_CONTROL_UI_ORIGIN) || 'http://127.0.0.1:18789';
        let M = trim(process.env.OPENROUTER_MODEL) || 'openrouter/openai/gpt-4o-mini';
        if (!M.startsWith('openrouter/')) M = 'openrouter/' + M;
        const TP_RAW = trim(process.env.OPENCLAW_GATEWAY_TRUSTED_PROXIES);
        const trustedFromEnv = TP_RAW
          ? TP_RAW.split(',').map((s) => s.trim()).filter(Boolean)
          : null;
        const key = trim(process.env.OPENROUTER_API_KEY);
        let hadFile = false;
        let parseOk = false;
        let base = {};
        try {
          if (fs.existsSync(target)) {
            hadFile = true;
            base = JSON.parse(fs.readFileSync(target, 'utf8'));
            parseOk = base && typeof base === 'object';
            if (!parseOk) base = {};
          }
        } catch (_) {
          base = {};
        }
        const envIn = base.env && typeof base.env === 'object' ? base.env : {};
        const gwIn = base.gateway && typeof base.gateway === 'object' ? base.gateway : {};
        const cuiIn = gwIn.controlUi && typeof gwIn.controlUi === 'object' ? gwIn.controlUi : {};
        const agIn = base.agents && typeof base.agents === 'object' ? base.agents : {};
        const defIn = agIn.defaults && typeof agIn.defaults === 'object' ? agIn.defaults : {};
        const modelsIn = defIn.models && typeof defIn.models === 'object' ? { ...defIn.models } : {};
        if (!modelsIn[M]) modelsIn[M] = {};
        const origins = new Set([
          ...(Array.isArray(cuiIn.allowedOrigins) ? cuiIn.allowedOrigins : []),
          'http://127.0.0.1:18789',
          'http://localhost:18789',
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
        if (trustedFromEnv && trustedFromEnv.length) {
          out.gateway.trustedProxies = trustedFromEnv;
        }
        out.agents = {
          ...agIn,
          defaults: {
            ...defIn,
            model: M,
            models: modelsIn,
          },
        };
        const tmp = target + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(out) + '\n');
        fs.renameSync(tmp, target);
        fs.chownSync(target, uid, gid);
        // #region agent log
        console.error(JSON.stringify({ sessionId: '225c6f', hypothesisId: 'H-merge', location: 'openclaw-workspace-init', message: 'merged openclaw.json', data: { hadFile, parseOk, topKeys: Object.keys(out), hasEnvBlock: !!out.env && Object.keys(out.env).length > 0, model: M, trustedSet: !!(trustedFromEnv && trustedFromEnv.length) }, timestamp: Date.now() }));
        // #endregion

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
