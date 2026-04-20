import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PORT = Number(process.env.PORT || 8080)
const SECRET = (process.env.DEPLOY_AGENT_SECRET || '').trim()
const BASE_DIR = (process.env.DEPLOY_BASE_DIR || '/docker').trim()
const BODY_LIMIT = Number(process.env.DEPLOY_BODY_LIMIT_BYTES || 2_000_000)
const COMPOSE_TIMEOUT_MS = Number(process.env.DEPLOY_COMPOSE_TIMEOUT_MS || 600_000)
const POST_DEPLOY_TIMEOUT_MS = Number(process.env.DEPLOY_POST_DEPLOY_TIMEOUT_MS || 120_000)
/** Host bind mount for OpenClaw home; chown so the image `node` user can write. */
const OPENCLAW_WORKSPACE_CHOWN = (process.env.OPENCLAW_WORKSPACE_CHOWN || '1000:1000').trim()

type DeployPayload = {
  botDeploymentId?: string
  customerLabel?: string
  env?: Record<string, unknown>
  composeYaml?: string
  updateStackOnly?: boolean
}

type PostDeployPayload = {
  botDeploymentId?: string
  customerLabel?: string
}

function extractBearer(auth: string | undefined): string | null {
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null
  return auth.slice(7).trim() || null
}

function bearerMatches(token: string | null, expected: string): boolean {
  if (!token || !expected) return false
  if (token.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'))
  } catch {
    return false
  }
}

/** Lowercase slug: non-alphanumeric → hyphen, collapse, trim edges. */
export function slugFromCustomerLabel(label: string): string {
  const raw = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
  return raw || 'deployment'
}

/** Directory name under DEPLOY_BASE_DIR; includes deployment id to avoid collisions. */
export function projectDirName(customerLabel: string, botDeploymentId: string): string {
  const slug = slugFromCustomerLabel(customerLabel)
  const id = botDeploymentId.trim()
  return `openclaw-${slug}__${id}`
}

/** Docker Compose project name (-p): [a-z0-9_-] only. */
function composeProjectName(dirName: string): string {
  return dirName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200) || 'openclaw_stack'
}

function envToDotenv(env: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string') continue
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue
    if (/[\r\n]/.test(v)) {
      throw new Error(`env key ${k} value must not contain newlines`)
    }
    const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    lines.push(`${k}="${escaped}"`)
  }
  return `${lines.join('\n')}\n`
}

async function readJsonBody(req: IncomingMessage): Promise<{ ok: true; body: unknown } | { ok: false; status: number; message: string }> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > BODY_LIMIT) {
      return { ok: false, status: 413, message: 'Request body too large' }
    }
    chunks.push(buf)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    return { ok: false, status: 400, message: 'Empty body' }
  }
  try {
    return { ok: true, body: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, status: 400, message: 'Invalid JSON' }
  }
}

async function ensureBotBridge(): Promise<void> {
  try {
    await execFileAsync('docker', ['network', 'inspect', 'bot-bridge'], { timeout: 30_000 })
  } catch {
    await execFileAsync('docker', ['network', 'create', 'bot-bridge'], { timeout: 30_000 })
  }
}

function composeUsesOpenclawWorkspaceBindMount(composeYaml: string): boolean {
  return composeYaml.includes('openclaw/workspace')
}

/** Ensures workspace dir exists and is writable by UID 1000 (compose init only chowns; no JSON here). */
async function ensureOpenclawWorkspaceDirChowned(projectRoot: string): Promise<void> {
  const workspace = path.join(projectRoot, 'openclaw', 'workspace')
  await fs.mkdir(workspace, { recursive: true, mode: 0o755 })
  await execFileAsync('chown', ['-R', OPENCLAW_WORKSPACE_CHOWN, workspace], { timeout: 60_000 })
}

function sendJson(res: ServerResponse, status: number, obj: Record<string, unknown>): void {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

async function handleDeploy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractBearer(req.headers.authorization)
  if (!bearerMatches(token, SECRET)) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized' })
    return
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) {
    sendJson(res, parsed.status, { ok: false, error: parsed.message })
    return
  }

  const body = parsed.body as DeployPayload
  const botDeploymentId = body.botDeploymentId?.trim()
  const customerLabel = body.customerLabel?.trim()
  const composeYaml = body.composeYaml?.trim()
  const env: Record<string, unknown> =
    body.env && typeof body.env === 'object' && !Array.isArray(body.env) ? { ...body.env } : {}
  if (SECRET) {
    const existing = env['STACK_AGENT_BEARER_TOKEN']
    const missing =
      typeof existing !== 'string' || existing.trim() === ''
    if (missing) {
      env['STACK_AGENT_BEARER_TOKEN'] = SECRET
    }
  }

  const defaultHookImage = (process.env.DEFAULT_OPENCLAW_STACK_HOOK_IMAGE || '').trim()
  if (defaultHookImage) {
    const hi = env['OPENCLAW_STACK_HOOK_IMAGE']
    const hookMissing =
      typeof hi !== 'string' || hi.trim() === ''
    if (hookMissing) {
      env['OPENCLAW_STACK_HOOK_IMAGE'] = defaultHookImage
    }
  }

  if (!botDeploymentId) {
    sendJson(res, 400, { ok: false, error: 'botDeploymentId is required' })
    return
  }
  if (!customerLabel) {
    sendJson(res, 400, { ok: false, error: 'customerLabel is required' })
    return
  }
  if (!composeYaml) {
    sendJson(res, 400, { ok: false, error: 'composeYaml is required' })
    return
  }

  let dotenv: string
  try {
    dotenv = envToDotenv(env)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid env'
    sendJson(res, 400, { ok: false, error: msg })
    return
  }

  const dirName = projectDirName(customerLabel, botDeploymentId)
  const projectRoot = path.resolve(BASE_DIR, dirName)
  const project = composeProjectName(dirName)

  try {
    await fs.mkdir(projectRoot, { recursive: true, mode: 0o755 })
    await fs.writeFile(path.join(projectRoot, 'docker-compose.yml'), composeYaml, { mode: 0o644 })
    await fs.writeFile(path.join(projectRoot, '.env'), dotenv, { mode: 0o600 })

    if (composeUsesOpenclawWorkspaceBindMount(composeYaml)) {
      await ensureOpenclawWorkspaceDirChowned(projectRoot)
    }

    await ensureBotBridge()

    await execFileAsync(
      'docker',
      ['compose', '-p', project, 'up', '-d'],
      { cwd: projectRoot, timeout: COMPOSE_TIMEOUT_MS, env: process.env },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stderr = (e as NodeJS.ErrnoException & { stderr?: string })?.stderr
    const detail = stderr ? `${msg}: ${stderr}`.slice(0, 2000) : msg.slice(0, 2000)
    sendJson(res, 500, { ok: false, error: 'Deploy failed', detail })
    return
  }

  sendJson(res, 200, { ok: true, projectDir: projectRoot, composeProject: project })
}

async function handlePostDeploy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractBearer(req.headers.authorization)
  if (!bearerMatches(token, SECRET)) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized' })
    return
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) {
    sendJson(res, parsed.status, { ok: false, error: parsed.message })
    return
  }

  const body = parsed.body as PostDeployPayload
  const botDeploymentId = body.botDeploymentId?.trim()
  const customerLabel = body.customerLabel?.trim()

  if (!botDeploymentId) {
    sendJson(res, 400, { ok: false, error: 'botDeploymentId is required' })
    return
  }
  if (!customerLabel) {
    sendJson(res, 400, { ok: false, error: 'customerLabel is required' })
    return
  }

  const dirName = projectDirName(customerLabel, botDeploymentId)
  const projectRoot = path.resolve(BASE_DIR, dirName)
  const project = composeProjectName(dirName)
  const composePath = path.join(projectRoot, 'docker-compose.yml')

  try {
    await fs.access(composePath)
  } catch {
    sendJson(res, 404, { ok: false, error: 'Compose project not found on this host', projectRoot })
    return
  }

  try {
    await execFileAsync(
      'docker',
      [
        'compose',
        '-p',
        project,
        '--profile',
        'post-deploy',
        'run',
        '--rm',
        'openclaw-post-deploy',
      ],
      { cwd: projectRoot, timeout: POST_DEPLOY_TIMEOUT_MS, env: process.env },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stderr = (e as NodeJS.ErrnoException & { stderr?: string })?.stderr
    const detail = stderr ? `${msg}: ${stderr}`.slice(0, 2000) : msg.slice(0, 2000)
    sendJson(res, 500, { ok: false, error: 'Post-deploy failed', detail })
    return
  }

  sendJson(res, 200, { ok: true, projectDir: projectRoot, composeProject: project })
}

function handler(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url?.split('?')[0] || '/'

  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method === 'POST' && url === '/deploy') {
    void handleDeploy(req, res)
    return
  }

  if (req.method === 'POST' && url === '/post-deploy') {
    void handlePostDeploy(req, res)
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
}

if (!SECRET) {
  console.error('DEPLOY_AGENT_SECRET is required')
  process.exit(1)
}

createServer(handler).listen(PORT, () => {
  console.log(`deploy-agent listening on :${PORT} baseDir=${BASE_DIR}`)
})
