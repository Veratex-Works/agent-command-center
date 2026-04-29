/**
 * HTTP merge hook for OpenClaw stacks (Hostinger / compose).
 * GET /health — plain "ok"
 * POST /post-deploy — Bearer STACK_AGENT_BEARER_TOKEN; merges env into /work/openclaw.json
 */
import http from 'node:http'
import fs from 'node:fs'

const PORT = Number(process.env.STACK_HOOK_PORT || 18790)
const token = String(process.env.STACK_AGENT_BEARER_TOKEN || '').trim()

function runMerge() {
  const target = '/work/openclaw.json'
  const uid = 1000
  const gid = 1000
  function expandTrustAddrs(list) {
    const s = new Set()
    const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
    for (const raw of list) {
      const ip = String(raw).trim()
      if (!ip) continue
      s.add(ip)
      if (ipv4.test(ip)) s.add('::ffff:' + ip)
    }
    return [...s]
  }
  function normalizeTrustedProxyEntry(raw) {
    let s = String(raw).trim()
    if (!s) return ''
    s = s.replace(/^https?:\/\//i, '')
    const slash = s.indexOf('/')
    if (slash >= 0) s = s.slice(0, slash)
    const ipv4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/
    const m = s.match(ipv4Port)
    if (m) return m[1]
    return s
  }
  const trim = (s) => (s || '').trim().replace(/\r|\n/g, '')
  const O = trim(process.env.OPENCLAW_CONTROL_UI_ORIGIN) || 'http://127.0.0.1:18789'
  const modelRaw = trim(process.env.OPENROUTER_MODEL)
  const TP_RAW = trim(process.env.OPENCLAW_GATEWAY_TRUSTED_PROXIES)
  const trustedFromEnv = TP_RAW
    ? [...new Set(TP_RAW.split(',').map((s) => normalizeTrustedProxyEntry(s)).filter(Boolean))]
    : []
  const key = trim(process.env.OPENROUTER_API_KEY)
  const gatewayToken = trim(process.env.OPENCLAW_GATEWAY_TOKEN)
  let base = {}
  try {
    if (fs.existsSync(target)) {
      base = JSON.parse(fs.readFileSync(target, 'utf8'))
      if (!base || typeof base !== 'object') base = {}
    }
  } catch {
    base = {}
  }
  const b64 = trim(process.env.OPENCLAW_BASE_JSON_B64)
  if (b64) {
    try {
      const dec = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
      if (dec && typeof dec === 'object' && !Array.isArray(dec)) {
        base = { ...dec, ...base }
      }
    } catch {}
  }
  const envIn = base.env && typeof base.env === 'object' ? base.env : {}
  const gwIn = base.gateway && typeof base.gateway === 'object' ? base.gateway : {}
  const cuiIn = gwIn.controlUi && typeof gwIn.controlUi === 'object' ? gwIn.controlUi : {}
  const agIn = base.agents && typeof base.agents === 'object' ? base.agents : {}
  const defIn = agIn.defaults && typeof agIn.defaults === 'object' ? agIn.defaults : {}
  const origins = new Set([
    ...(Array.isArray(cuiIn.allowedOrigins) ? cuiIn.allowedOrigins : []),
    'http://127.0.0.1:18789',
    'http://localhost:18789',
    'http://localhost:5173',
    O,
  ])
  const out = { ...base }
  out.env = { ...envIn, ...(key ? { OPENROUTER_API_KEY: key } : {}) }
  out.gateway = {
    ...gwIn,
    controlUi: {
      ...cuiIn,
      allowedOrigins: [...origins],
      dangerouslyDisableDeviceAuth: true,
    },
  }
  const authMerged = {
    ...(out.gateway.auth && typeof out.gateway.auth === 'object' ? out.gateway.auth : {}),
    ...(gatewayToken ? { token: gatewayToken } : {}),
  }
  if (Object.keys(authMerged).length) {
    out.gateway.auth = authMerged
  }
  const existingTp = Array.isArray(gwIn.trustedProxies)
    ? gwIn.trustedProxies.map((x) => normalizeTrustedProxyEntry(String(x))).filter(Boolean)
    : []
  const tpMerged = [...new Set([...existingTp, ...trustedFromEnv])].filter(Boolean)
  if (tpMerged.length) {
    const cleaned = [...new Set(tpMerged.map(normalizeTrustedProxyEntry).filter(Boolean))]
    out.gateway.trustedProxies = expandTrustAddrs(cleaned)
  }
  if (modelRaw) {
    let M = modelRaw
    if (!M.startsWith('openrouter/')) M = 'openrouter/' + M
    const modelsIn = defIn.models && typeof defIn.models === 'object' ? { ...defIn.models } : {}
    if (!modelsIn[M]) modelsIn[M] = {}
    out.agents = {
      ...agIn,
      defaults: {
        ...defIn,
        model: M,
        models: modelsIn,
      },
    }
  }
  const tmp = target + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(out) + '\n')
  fs.renameSync(tmp, target)
  fs.chownSync(target, uid, gid)
  // Do not chown -R /work here: OpenClaw mutates plugin-runtime-deps concurrently; recursive
  // chown races and can ENOENT on paths like dist/.buildstamp. openclaw-workspace-init already
  // chowns the bind mount; post-deploy only needs the merged JSON owned by UID 1000.
}

const server = http.createServer((req, res) => {
  const u = (req.url || '').split('?')[0]
  if (req.method === 'GET' && u === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }
  if (req.method !== 'POST' || u !== '/post-deploy') {
    res.writeHead(404)
    res.end()
    return
  }
  const auth = String(req.headers.authorization || '')
  if (!token || auth !== 'Bearer ' + token) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
    return
  }
  req.on('data', () => {})
  req.on('end', () => {
    try {
      runMerge()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: msg }))
    }
  })
})

server.listen(PORT, '0.0.0.0')
