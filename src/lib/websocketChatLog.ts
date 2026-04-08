/**
 * WebSocket traffic logger (full raw payloads).
 *
 * Development: batches are POSTed to the Vite dev server, which appends to
 * `websocket-chat-logs.json` at the repo root.
 *
 * Production: register a sink before or early in app startup so entries are
 * persisted or forwarded (browsers cannot write arbitrary paths on disk).
 *
 *   import { registerWsChatLogProductionSink } from '@/lib/websocketChatLog'
 *   registerWsChatLogProductionSink(async (entries) => { ... })
 */
export type WsChatLogEntry = {
  t: string
  direction: 'in' | 'out'
  data: unknown
}

export type WsChatLogSink = (entries: readonly WsChatLogEntry[]) => void | Promise<void>

const buffer: WsChatLogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let productionSink: WsChatLogSink | null = null

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

function shouldNetworkFlush(): boolean {
  return import.meta.env.DEV
}

function shouldInvokeSink(): boolean {
  return productionSink !== null
}

function scheduleFlush() {
  if (!shouldNetworkFlush() && !shouldInvokeSink()) return
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
    if (import.meta.env.DEV) {
      await fetch(LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: batch }),
      })
    } else if (productionSink) {
      await Promise.resolve(productionSink(batch))
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
    data,
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

/** Best-effort flush before unload (dev server endpoint only). */
export function flushWsChatLogSync() {
  if (!import.meta.env.DEV || !buffer.length) return
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
