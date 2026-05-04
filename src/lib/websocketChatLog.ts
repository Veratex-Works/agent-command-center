/**
 * WebSocket traffic logger (full raw payloads).
 *
 * When a production sink is registered (e.g. Supabase `chat_logs`), batches are
 * sent there first. Otherwise, development POSTs to the Vite dev server for
 * `websocket-chat-logs.json`; production without a sink only caps memory.
 *
 *   import { registerWsChatLogProductionSink } from '@/lib/websocketChatLog'
 *   registerWsChatLogProductionSink(async (entries) => { ... })
 */
export type WsChatLogEntry = {
  t: string
  direction: 'in' | 'out'
  data: unknown
}

/** Strip large base64 from outbound `chat.send` before dev file / Supabase sinks. */
export function sanitizeWsChatLogData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const d = data as Record<string, unknown>
  if (d.type !== 'req' || d.method !== 'chat.send') return data
  const params = d.params
  if (!params || typeof params !== 'object') return data
  const p = { ...(params as Record<string, unknown>) }
  if (!Array.isArray(p.attachments)) return { ...d, params: p }
  p.attachments = p.attachments.map((att) => {
    if (!att || typeof att !== 'object') return att
    const o = { ...(att as Record<string, unknown>) }
    if (typeof o.content === 'string' && o.content.length > 96) {
      o.content = `[redacted base64 ${o.content.length} chars]`
    }
    return o
  })
  return { ...d, params: p }
}

export type WsChatLogSink = (entries: readonly WsChatLogEntry[]) => void | Promise<void>

const buffer: WsChatLogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let productionSink: WsChatLogSink | null = null

/** Current gateway session key for persisted rows (set from chat UI). */
let sessionKeyGetter: () => string = () => ''

export function setWsChatLogSessionKeyGetter(getter: () => string) {
  sessionKeyGetter = getter
}

export function getWsChatLogSessionKey(): string {
  return sessionKeyGetter()
}

/** In production, if no sink is registered, keep only this many entries in memory. */
const PROD_BUFFER_CAP = 5000

const FLUSH_MS = 400
const LOG_ENDPOINT = '/__openclaw/ws-chat-log'

export function registerWsChatLogProductionSink(sink: WsChatLogSink | null) {
  productionSink = sink
  if (sink && buffer.length) scheduleFlush()
}

export function getWsChatLogProductionSink(): WsChatLogSink | null {
  return productionSink
}

function shouldInvokeSink(): boolean {
  return productionSink !== null
}

function shouldFlushToDevFile(): boolean {
  return import.meta.env.DEV && !productionSink
}

function scheduleFlush() {
  if (!shouldFlushToDevFile() && !shouldInvokeSink()) return
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    void flushPersisted()
  }, FLUSH_MS)
}

async function flushPersisted() {
  if (!buffer.length) return
  const batch = buffer.splice(0, buffer.length)
  try {
    if (productionSink) {
      await Promise.resolve(productionSink(batch))
    } else if (import.meta.env.DEV) {
      await fetch(LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: batch }),
      })
    }
  } catch {
    buffer.unshift(...batch)
  }
}

/** Append one WebSocket frame (parsed JSON or parse-failure wrapper). */
export function logWsChat(direction: 'in' | 'out', data: unknown) {
  const entry: WsChatLogEntry = {
    t: new Date().toISOString(),
    direction,
    data: sanitizeWsChatLogData(data),
  }
  buffer.push(entry)

  if (import.meta.env.PROD && !productionSink && buffer.length > PROD_BUFFER_CAP) {
    buffer.splice(0, buffer.length - PROD_BUFFER_CAP)
  }

  scheduleFlush()
}

/** Log inbound payload when JSON.parse fails (raw string, untruncated). */
export function logWsChatRawIn(raw: string) {
  logWsChat('in', { parseError: true, raw })
}

export function getWsChatLogBuffer(): readonly WsChatLogEntry[] {
  return buffer
}

/** Best-effort flush before unload (Vite dev file endpoint only). */
export function flushWsChatLogSync() {
  if (!import.meta.env.DEV || !buffer.length || productionSink) return
  const batch = buffer.splice(0, buffer.length)
  const payload = JSON.stringify({ entries: batch })
  try {
    const url = new URL(LOG_ENDPOINT, window.location.origin)
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon(url.toString(), blob)
    }
  } catch {
    buffer.unshift(...batch)
  }
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.addEventListener('beforeunload', () => flushWsChatLogSync())
}
