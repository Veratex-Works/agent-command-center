-- Normalize gateway.trustedProxies entries: strip http(s)://, path, and IPv4 :port (OpenClaw matches bare IPs only).

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
        let M = trim(process.env.OPENROUTER_MODEL) || 'openrouter/openai/gpt-4o-mini';
        if (!M.startsWith('openrouter/')) M = 'openrouter/' + M;
        const TP_RAW = trim(process.env.OPENCLAW_GATEWAY_TRUSTED_PROXIES);
        const trustedFromEnv = TP_RAW
          ? [...new Set(TP_RAW.split(',').map((s) => normalizeTrustedProxyEntry(s)).filter(Boolean))]
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
        if (trustedFromEnv && trustedFromEnv.length) {
          out.gateway.trustedProxies = trustedFromEnv;
        }
        if (Array.isArray(out.gateway.trustedProxies) && out.gateway.trustedProxies.length) {
          const cleaned = [...new Set(out.gateway.trustedProxies.map(normalizeTrustedProxyEntry).filter(Boolean))];
          out.gateway.trustedProxies = expandTrustAddrs(cleaned);
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
        let verifyTpLen = -1;
        try {
          const v = JSON.parse(fs.readFileSync(target, 'utf8'));
          verifyTpLen = Array.isArray(v.gateway && v.gateway.trustedProxies) ? v.gateway.trustedProxies.length : -1;
        } catch (_) {
          verifyTpLen = -2;
        }
        console.error(JSON.stringify({ sessionId: '225c6f', hypothesisId: 'H-merge', location: 'openclaw-workspace-init', message: 'merged openclaw.json', data: { hadFile, parseOk, topKeys: Object.keys(out), hasEnvBlock: !!out.env && Object.keys(out.env).length > 0, model: M, trustedSet: !!(trustedFromEnv && trustedFromEnv.length), trustEnvHadHttp: /https?:\/\//i.test(TP_RAW || ''), trustedExpandedLen: Array.isArray(out.gateway.trustedProxies) ? out.gateway.trustedProxies.length : 0 }, timestamp: Date.now() }));
        console.error(JSON.stringify({ sessionId: '225c6f', hypothesisId: 'H-readback', location: 'openclaw-workspace-init', message: 'disk gateway.trustedProxies', data: { verifyTpLen }, timestamp: Date.now() }));
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
