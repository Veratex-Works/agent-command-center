import { useRef, useCallback } from 'react'
import { useChatStore } from '@/store/useChatStore'
import { getDeviceIdentity, signChallenge } from '@/lib/crypto'
import { saveDeviceToken } from '@/lib/storage'
import { logWsChat, logWsChatRawIn } from '@/lib/websocketChatLog'
import type { Config, GatewayPayload, HistoryEntry, HistoryMessage } from '@/types'

const LEGACY_DEFAULT_SESSION_KEY = 'agent:main:webchat:direct:user1'

/** Keys often used by OpenClaw / provider payloads for human-visible copy (nested objects allowed). */
const TEXT_LIKE_KEYS = [
  'text',
  'content',
  'value',
  'message',
  'body',
  'output',
  'delta',
  'output_text',
  'public',
  'parsed',
  'reasoning',
  'thinking',
  'transcript',
  'summary',
  'result',
  'display',
  'reply',
  'markdown',
] as const

function normalizeTextField(v: unknown, depth: number): string {
  if (depth > 12 || v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    return v.map((x) => normalizeTextField(x, depth + 1)).join('')
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    let acc = ''
    for (const k of TEXT_LIKE_KEYS) {
      if (k in o && o[k] !== undefined) {
        const raw = o[k]
        if ((k === 'content' || k === 'output') && typeof raw === 'string' && !isPlausibleUserVisibleAssistantText(raw)) {
          continue
        }
        acc += normalizeTextField(raw, depth + 1)
      }
    }
    if (acc.trim()) return acc
    for (const val of Object.values(o)) {
      if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
        acc += normalizeTextField(val, depth + 1)
      }
    }
    return acc
  }
  return ''
}

/** Reject raw provider / HTTP payloads mistaken for assistant prose (e.g. OpenAI `choices` JSON). */
function isPlausibleUserVisibleAssistantText(s: string): boolean {
  const t = s.trim()
  if (t.length < 1) return false
  if (t.length > 120_000) return false
  const head = t.slice(0, 4000).toLowerCase()
  if (head.includes('"choices"')) return false
  if (head.includes('openai-completions')) return false
  if (head.includes('"prompt_tokens"') || head.includes('"completion_tokens"')) return false
  if (head.includes('chatcmpl')) return false
  if (head.includes('"finish_reason"')) return false
  if (head.includes('"usage"') && head.includes('"completion_tokens"')) return false
  if (/^\s*[\[{]/.test(t) && head.includes('"model"')) return false
  const sample = t.slice(0, Math.min(t.length, 2500))
  const jsony = (sample.match(/["{}:[\],\\]/g) ?? []).length
  if (sample.length > 180 && jsony / sample.length > 0.22) return false
  return true
}

/** When `__openclaw` holds prose under uncommon keys, pick the best string leaf. */
function scoreTranscriptCandidate(s: string): number {
  const t = s.trim()
  if (t.length < 2) return -1
  if (!isPlausibleUserVisibleAssistantText(t)) return -1
  let score = Math.min(t.length, 12000)
  if (/\s/.test(t)) score += 120
  if (/[.!?…]/.test(t)) score += 40
  const start = t.trimStart()
  if (start.startsWith('{') || start.startsWith('[')) score -= 250
  return score
}

function bestTranscriptStringDeep(node: unknown, depth: number): { text: string; score: number } {
  if (depth > 18) return { text: '', score: -1 }
  if (typeof node === 'string') {
    const sc = scoreTranscriptCandidate(node)
    return sc > 0 ? { text: node, score: sc } : { text: '', score: -1 }
  }
  if (Array.isArray(node)) {
    let best: { text: string; score: number } = { text: '', score: -1 }
    for (const el of node) {
      const r = bestTranscriptStringDeep(el, depth + 1)
      if (r.score > best.score) best = r
    }
    return best
  }
  if (typeof node === 'object' && node !== null) {
    let best: { text: string; score: number } = { text: '', score: -1 }
    for (const v of Object.values(node as Record<string, unknown>)) {
      const r = bestTranscriptStringDeep(v, depth + 1)
      if (r.score > best.score) best = r
    }
    return best
  }
  return { text: '', score: -1 }
}

function extractMessageText(content: HistoryMessage['content']): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((block) => normalizeTextField(block, 0)).join('').trim()
  }
  return normalizeTextField(content, 0).trim()
}

/** Full transcript row: `content` blocks may be empty while copy lives on sibling fields. */
function extractVisibleTextFromHistoryMessage(msg: HistoryMessage): string {
  const strictAssistant =
    msg.role === 'assistant' || msg.role === 'model'
  const accept = (s: string): boolean => {
    const t = s.trim()
    if (!t) return false
    if (!strictAssistant) return true
    return isPlausibleUserVisibleAssistantText(t)
  }

  if (typeof msg.text === 'string' && accept(msg.text)) return msg.text.trim()
  if (typeof msg.preview === 'string' && accept(msg.preview)) return msg.preview.trim()
  const fromParts = normalizeTextField(msg.parts, 0).trim()
  if (fromParts && accept(fromParts)) return fromParts
  const fromPayload = normalizeTextField(msg.payload, 0).trim()
  if (fromPayload && accept(fromPayload)) return fromPayload
  const fromAnn = normalizeTextField(msg.annotations, 0).trim()
  if (fromAnn && accept(fromAnn)) return fromAnn

  // `api` is provider / routing metadata (often raw completion JSON) — never show it as chat.
  const oc = msg.__openclaw
  if (strictAssistant) {
    const viaOcDeep = bestTranscriptStringDeep(oc, 0)
    if (viaOcDeep.score > 0) return viaOcDeep.text.trim()
  }

  const fromBlocks = extractMessageText(msg.content)
  if (fromBlocks && accept(fromBlocks)) return fromBlocks
  return ''
}

/** Assistant-visible text from a `chat` event payload (some gateway builds omit `message` on `final`). */
function extractAssistantTextFromChatPayload(p: GatewayPayload['payload'] | undefined): string {
  if (!p) return ''
  if (p.message) {
    const m = p.message as HistoryMessage
    if (m.role === 'user') return ''
    if (m.role === 'assistant' || m.role === 'model' || m.role === undefined) {
      return extractVisibleTextFromHistoryMessage(m)
    }
    return ''
  }
  if (p.role === 'assistant') {
    const c = p.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) return extractMessageText(c as HistoryMessage['content'])
  }
  const fromData = p.data?.text ?? p.data?.content
  if (typeof fromData === 'string' && fromData) return fromData
  const msgs = p.messages
  if (Array.isArray(msgs) && msgs.length) {
    const lastAssistant = [...msgs]
      .reverse()
      .find((x) => x.role === 'assistant' || x.role === 'model')
    if (lastAssistant) return extractVisibleTextFromHistoryMessage(lastAssistant)
  }
  return ''
}


function isPayloadForActiveSession(
  payloadSessionKey: string | undefined,
  config: Config,
  resolve: (c: Config) => string,
): boolean {
  const active = resolve(config)
  const sk = (payloadSessionKey ?? active).trim() || active
  return sk === active
}

/** Suppress scheduled heartbeat ack text from appearing as chat. */
function isHeartbeatAckText(s: string): boolean {
  const t = s.trim()
  return t === 'HEARTBEAT' || t === 'HEARTBEAT_OK'
}

/**
 * @param getFallbackSessionKey When `config.sessionKey` is empty, use this (e.g. user id segment).
 *   Passed by reference; latest callback is read via an internal ref (stable `resolveSessionKey`).
 */
export function useWebSocket(getFallbackSessionKey?: () => string | undefined) {
  const wsRef = useRef<WebSocket | null>(null)
  const fallbackRef = useRef<(() => string | undefined) | undefined>(getFallbackSessionKey)
  fallbackRef.current = getFallbackSessionKey
  const currentRunIdRef = useRef<string | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const streamingTextRef = useRef<string>('')
  const pendingReconnectRef = useRef(false)
  /** When set, assistant UI comes from `chat` `state: final` (not agent deltas). */
  const chatFinalPendingRunIdRef = useRef<string | null>(null)
  /** Last cumulative assistant text when the gateway does not emit the chat lane. */
  const agentOnlyBufferRef = useRef<string>('')

  const store = useChatStore

  const resolveSessionKey = useCallback((config: Config): string => {
    const manual = config.sessionKey?.trim()
    if (manual) return manual
    const fb = fallbackRef.current?.()?.trim()
    if (fb) return fb
    return LEGACY_DEFAULT_SESSION_KEY
  }, [])

  const sendRaw = useCallback((obj: unknown) => {
    logWsChat('out', obj)
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj))
    }
  }, [])

  const stopStreaming = useCallback(() => {
    store.getState().setRunning(false)
    store.getState().setTyping(false)
    chatFinalPendingRunIdRef.current = null
    agentOnlyBufferRef.current = ''
    if (streamingIdRef.current) {
      store.getState().finalizeStreamingMessage(streamingIdRef.current)
      streamingIdRef.current = null
    }
    streamingTextRef.current = ''
    currentRunIdRef.current = null
  }, [store])

  const fetchHistory = useCallback(
    (config: Config) => {
      const key = resolveSessionKey(config)
      sendRaw({
        type: 'req',
        method: 'chat.history',
        id: `hist-${Date.now()}`,
        params: { sessionKey: key },
      })
    },
    [sendRaw, resolveSessionKey],
  )

  const renderHistory = useCallback(
    (entries: HistoryEntry[]) => {
      if (!entries.length) return
      store.getState().clearMessages()
      entries.forEach((entry) => {
        if (!entry.content) return
        if (entry.role !== 'user' && isHeartbeatAckText(entry.content)) return
        const role = entry.role === 'user' ? 'user' : 'bot'
        const ts = entry.ts
          ? new Date(Number(entry.ts)).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : undefined
        store.getState().addMessage({ type: role, content: entry.content, ts })
      })
    },
    [store],
  )

  const renderHistoryMessages = useCallback(
    (messages: HistoryMessage[]) => {
      if (!messages.length) return
      store.getState().clearMessages()
      messages.forEach((msg) => {
        const isUser = msg.role === 'user'
        const isAssistantLike = msg.role === 'assistant' || msg.role === 'model'
        if (!isUser && !isAssistantLike) return

        const text = extractVisibleTextFromHistoryMessage(msg)
        if (!text) return
        if (isAssistantLike && isHeartbeatAckText(text)) return

        const role = isUser ? 'user' : 'bot'
        const ts = msg.timestamp
          ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : undefined
        store.getState().addMessage({ type: role, content: text, ts })
      })
    },
    [store],
  )

  const appendStreamingChunk = useCallback(
    (text: string, isDone: boolean) => {
      if (!streamingIdRef.current) {
        store.getState().setTyping(false)
        streamingTextRef.current = ''
        const id = store.getState().addMessage({ type: 'bot', content: '', streaming: true })
        streamingIdRef.current = id
      }

      if (text) {
        streamingTextRef.current += text
        store.getState().updateStreamingMessage(streamingIdRef.current!, streamingTextRef.current)
      }

      if (isDone) {
        stopStreaming()
      }
    },
    [store, stopStreaming],
  )

  const handleChatEvent = useCallback(
    (payload: GatewayPayload['payload']) => {
      if (!payload) return
      const { role, content, done, aborted, runId } = payload

      if (runId) currentRunIdRef.current = runId

      if (role === 'assistant') {
        appendStreamingChunk(content ?? '', !!(done || aborted))
      }
    },
    [appendStreamingChunk],
  )

  const handleChatLaneEvent = useCallback(
    (payload: GatewayPayload['payload']) => {
      if (!payload?.state) return
      const { config } = store.getState()
      const match = isPayloadForActiveSession(payload.sessionKey, config, resolveSessionKey)
      if (!match) return

      const { runId, state, message } = payload
      if (runId) currentRunIdRef.current = runId

      if (state === 'delta') {
        if (message?.role !== 'assistant' && message?.role !== 'model') return
        if (runId) chatFinalPendingRunIdRef.current = runId
        agentOnlyBufferRef.current = ''
        store.getState().setTyping(true)
        return
      }

      if (state === 'final' || state === 'aborted' || state === 'error') {
        const text = extractAssistantTextFromChatPayload(payload)
        chatFinalPendingRunIdRef.current = null
        agentOnlyBufferRef.current = ''
        streamingIdRef.current = null
        streamingTextRef.current = ''
        store.getState().setTyping(false)
        store.getState().setRunning(false)

        if (isHeartbeatAckText(text)) return

        if (text) {
          const tsFromMsg = message?.timestamp
          const ts =
            typeof tsFromMsg === 'number'
              ? new Date(tsFromMsg).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : undefined
          store.getState().addMessage({ type: 'bot', content: text, ts })
        } else {
          const cfg = config
          fetchHistory(cfg)
          queueMicrotask(() => {
            fetchHistory(cfg)
          })
          requestAnimationFrame(() => {
            fetchHistory(cfg)
          })
        }
      }
    },
    [store, resolveSessionKey, fetchHistory],
  )

  const handleAgentEvent = useCallback(
    (payload: GatewayPayload['payload']) => {
      if (!payload) return
      const { config } = store.getState()
      if (!isPayloadForActiveSession(payload.sessionKey, config, resolveSessionKey)) return

      const { stream, data, runId } = payload
      if (runId) currentRunIdRef.current = runId

      if (stream === 'lifecycle' && data?.phase === 'end') {
        if (chatFinalPendingRunIdRef.current) return

        const buf = agentOnlyBufferRef.current.trim()
        agentOnlyBufferRef.current = ''
        streamingIdRef.current = null
        streamingTextRef.current = ''
        store.getState().setTyping(false)
        store.getState().setRunning(false)

        if (buf && !isHeartbeatAckText(buf)) {
          const ts = data.endedAt
            ? new Date(data.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : undefined
          store.getState().addMessage({ type: 'bot', content: buf, ts })
        }
        return
      }

      if (stream === 'assistant' && data) {
        if (chatFinalPendingRunIdRef.current) return

        const text = data.text ?? data.content ?? ''
        if (text) agentOnlyBufferRef.current = text

        const isDone = !!(data.done || data.finished || data.aborted)
        if (isDone) {
          const finalText = (text || agentOnlyBufferRef.current).trim()
          agentOnlyBufferRef.current = ''
          streamingIdRef.current = null
          streamingTextRef.current = ''
          store.getState().setTyping(false)
          store.getState().setRunning(false)
          if (finalText && !isHeartbeatAckText(finalText)) {
            store.getState().addMessage({ type: 'bot', content: finalText })
          }
        }
      }
    },
    [store, resolveSessionKey],
  )

  const handleMessage = useCallback(
    async (msg: GatewayPayload) => {
      const { config } = store.getState()

      // Connect challenge — sign nonce and send full connect frame
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        const nonce = msg.payload?.nonce ?? ''
        const signedAt = Date.now()
        const identity = await getDeviceIdentity()
        const signature = await signChallenge(nonce, signedAt, identity.id, config.token, identity.privateKey)

        sendRaw({
          type: 'req',
          id: `connect-${Date.now()}`,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'openclaw-control-ui',
              version: '1.0.0',
              platform: 'macos',
              mode: 'webchat',
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
            commands: [],
            permissions: {},
            auth: { token: config.token },
            locale: navigator.language || 'en-US',
            userAgent: 'openclaw-webchat/1.0.0',
            device: {
              id: identity.id,
              publicKey: identity.publicKeyB64,
              signature,
              signedAt,
              nonce,
            },
          },
        })
        return
      }

      // hello-ok — connected
      if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
        if (msg.payload?.auth?.deviceToken) {
          saveDeviceToken(config.url, msg.payload.auth.deviceToken)
        }
        store.getState().setStatus('connected', 'connected')
        store.getState().addSystemMessage('Connected ✓', 'ok')
        fetchHistory(config)
        return
      }

      // Error response
      if (msg.type === 'res' && !msg.ok) {
        const code = msg.error?.details?.code ?? ''
        const hint = msg.error?.details?.recommendedNextStep ?? ''
        const reason = msg.error?.message ?? JSON.stringify(msg.error)

        if (code === 'AUTH_TOKEN_MISMATCH') {
          store.getState().setStatus('error', 'auth error')
          store.getState().addSystemMessage('Auth failed: token mismatch — check your token in settings', 'warn')
        } else if (code?.startsWith('DEVICE_AUTH')) {
          store.getState().setStatus('error', 'device auth error')
          store.getState().addSystemMessage(`Device auth failed (${code}): ${reason}`, 'warn')
        } else {
          store.getState().setStatus('error', 'error')
          store.getState().addSystemMessage(`Error: ${reason}${hint ? ' → ' + hint : ''}`, 'warn')
        }
        return
      }

      // Pairing required
      if (msg.type === 'event' && msg.event === 'connect.pairing') {
        store.getState().setStatus('error', 'pairing required')
        store
          .getState()
          .addSystemMessage(
            `⚠ Pairing required — run: openclaw devices approve ${msg.payload?.requestId ?? '<id>'}`,
            'warn',
          )
        return
      }

      // Gateway heartbeat indicator (not chat)
      if (msg.type === 'event' && msg.event === 'heartbeat' && msg.payload) {
        const p = msg.payload
        const status = typeof p.status === 'string' ? p.status : ''
        const explicitFail =
          p.indicatorType === 'error' || /fail|error|denied/i.test(status)
        const explicitOk = p.indicatorType === 'ok' || /^ok/i.test(status)
        const ok = !explicitFail && explicitOk
        store.getState().setHeartbeatIndicator({
          at: typeof p.ts === 'number' ? p.ts : Date.now(),
          ok,
          reason: typeof p.reason === 'string' ? p.reason : undefined,
          status: status || undefined,
        })
        return
      }

      // chat.send ack
      if (msg.type === 'res' && msg.id?.startsWith('chat-')) {
        if (msg.payload?.runId) currentRunIdRef.current = msg.payload.runId
        return
      }

      // chat.history response (empty `messages: []` must not be treated as success)
      if (msg.type === 'res' && msg.id?.startsWith('hist-')) {
        const pl = msg.payload
        const msgs = pl?.messages
        const ents = pl?.entries
        if (msgs?.length) {
          renderHistoryMessages(msgs)
          return
        }
        if (ents?.length) {
          renderHistory(ents)
          return
        }
        return
      }

      // Chat sync lane (delta / final / …) — `message` may be omitted on `final` in some gateway builds
      if (msg.type === 'event' && msg.event === 'chat' && msg.payload?.state) {
        handleChatLaneEvent(msg.payload)
        return
      }

      // Streaming chat events (legacy, no `state`)
      if (msg.type === 'event' && msg.event === 'chat') {
        handleChatEvent(msg.payload)
        return
      }

      // Agent streaming events
      if (msg.type === 'event' && msg.event === 'agent') {
        handleAgentEvent(msg.payload)
        return
      }
    },
    [
      store,
      sendRaw,
      fetchHistory,
      renderHistory,
      renderHistoryMessages,
      handleChatLaneEvent,
      handleChatEvent,
      handleAgentEvent,
      resolveSessionKey,
    ],
  )

  const connect = useCallback(async () => {
    const { config } = store.getState()
    if (!config.url) return

    const ws = wsRef.current
    if (ws) {
      ws.onclose = null
      ws.close()
      wsRef.current = null
    }

    store.getState().setStatus('connecting', 'connecting…')
    store.getState().addSystemMessage(`Connecting to ${config.url}…`)

    try {
      wsRef.current = new WebSocket(config.url)
    } catch (e) {
      store.getState().setStatus('error', 'invalid url')
      store.getState().addSystemMessage(`Invalid URL: ${(e as Error).message}`, 'warn')
      return
    }

    const newWs = wsRef.current

    newWs.onopen = () => {
      store.getState().setStatus('connecting', 'handshaking…')
    }

    newWs.onmessage = (e: MessageEvent) => {
      const raw = e.data as string
      let msg: GatewayPayload
      try {
        msg = JSON.parse(raw) as GatewayPayload
      } catch {
        logWsChatRawIn(typeof raw === 'string' ? raw : String(raw))
        return
      }
      logWsChat('in', msg)
      void handleMessage(msg)
    }

    newWs.onclose = (e: CloseEvent) => {
      store.getState().setStatus('error', 'disconnected')
      stopStreaming()
      if (!pendingReconnectRef.current) {
        store
          .getState()
          .addSystemMessage(
            `Connection closed (${e.code})${e.reason ? ': ' + e.reason : ''}`,
            'warn',
          )
      }
      pendingReconnectRef.current = false
      wsRef.current = null
    }

    newWs.onerror = () => {
      store.getState().setStatus('error', 'error')
    }
  }, [store, handleMessage, stopStreaming])

  const sendMessage = useCallback(
    (text: string) => {
      const { isRunning, config } = store.getState()
      if (!text.trim() || isRunning) return

      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        store.getState().addSystemMessage('Not connected. Check your gateway settings.', 'warn')
        return
      }

      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      store.getState().addMessage({ type: 'user', content: text, ts })
      store.getState().setTyping(true)
      store.getState().setRunning(true)
      streamingIdRef.current = null
      streamingTextRef.current = ''
      chatFinalPendingRunIdRef.current = null
      agentOnlyBufferRef.current = ''

      const idempotencyKey = `chat-${Date.now()}`
      const key = resolveSessionKey(config)

      sendRaw({
        type: 'req',
        method: 'chat.send',
        id: idempotencyKey,
        params: { message: text, idempotencyKey, sessionKey: key },
      })
    },
    [store, sendRaw, resolveSessionKey],
  )

  const abortRun = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const { config } = store.getState()
    sendRaw({
      type: 'req',
      method: 'chat.abort',
      id: `abort-${Date.now()}`,
      params: {
        ...(currentRunIdRef.current ? { runId: currentRunIdRef.current } : {}),
        sessionKey: resolveSessionKey(config),
      },
    })
    stopStreaming()
    store.getState().addSystemMessage('Run aborted.', 'warn')
  }, [store, sendRaw, stopStreaming, resolveSessionKey])

  const reconnect = useCallback(() => {
    pendingReconnectRef.current = true
    store.getState().clearMessages()
    void connect()
  }, [store, connect])

  const disconnect = useCallback(() => {
    const ws = wsRef.current
    if (ws) {
      ws.onclose = null
      ws.close()
      wsRef.current = null
    }
    stopStreaming()
  }, [stopStreaming])

  return { connect, disconnect, sendMessage, abortRun, reconnect }
}
