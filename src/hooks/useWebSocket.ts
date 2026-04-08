import { useRef, useCallback } from 'react'
import { useChatStore } from '@/store/useChatStore'
import { getDeviceIdentity, signChallenge } from '@/lib/crypto'
import { saveDeviceToken } from '@/lib/storage'
import type { GatewayPayload, HistoryEntry, HistoryMessage, ContentBlock } from '@/types'

function extractMessageText(content: HistoryMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((block): block is ContentBlock & { text: string } => block.type === 'text' && !!block.text)
    .map((block) => block.text)
    .join('')
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const currentRunIdRef = useRef<string | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const streamingTextRef = useRef<string>('')
  const pendingReconnectRef = useRef(false)

  const store = useChatStore

  const sendRaw = useCallback((obj: unknown) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj))
    }
  }, [])

  const stopStreaming = useCallback(() => {
    store.getState().setRunning(false)
    store.getState().setTyping(false)
    if (streamingIdRef.current) {
      store.getState().finalizeStreamingMessage(streamingIdRef.current)
      streamingIdRef.current = null
    }
    streamingTextRef.current = ''
    currentRunIdRef.current = null
  }, [store])

  const fetchHistory = useCallback(
    (sessionKey: string) => {
      const key = sessionKey || 'agent:main:webchat:direct:user'
      sendRaw({
        type: 'req',
        method: 'chat.history',
        id: `hist-${Date.now()}`,
        params: { sessionKey: key },
      })
    },
    [sendRaw],
  )

  const renderHistory = useCallback(
    (entries: HistoryEntry[]) => {
      if (!entries.length) return
      store.getState().clearMessages()
      entries.forEach((entry) => {
        if (!entry.content) return
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
        // Only render user and assistant turns — skip toolResult and other internal roles
        if (msg.role !== 'user' && msg.role !== 'assistant') return

        const text = extractMessageText(msg.content)
        if (!text) return

        const role = msg.role === 'user' ? 'user' : 'bot'
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

  const handleAgentEvent = useCallback(
    (payload: GatewayPayload['payload']) => {
      if (!payload) return
      const { stream, data, runId } = payload

      if (runId) currentRunIdRef.current = runId

      if (stream === 'assistant' && data) {
        const text = data.text ?? data.content ?? ''
        const isDone = !!(data.done || data.finished || data.aborted)
        appendStreamingChunk(text, isDone)
      }
    },
    [appendStreamingChunk],
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
            ...(config.sessionKey ? { sessionKey: config.sessionKey } : {}),
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
        fetchHistory(config.sessionKey)
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

      // chat.send ack
      if (msg.type === 'res' && msg.id?.startsWith('chat-')) {
        if (msg.payload?.runId) currentRunIdRef.current = msg.payload.runId
        return
      }

      // chat.history response — new format (payload.messages)
      if (msg.type === 'res' && msg.id?.startsWith('hist-') && msg.payload?.messages) {
        renderHistoryMessages(msg.payload.messages)
        return
      }

      // chat.history response — legacy format (payload.entries)
      if (msg.type === 'res' && msg.payload?.entries) {
        renderHistory(msg.payload.entries)
        return
      }

      // Streaming chat events (legacy)
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
    [store, sendRaw, fetchHistory, renderHistory, renderHistoryMessages, handleChatEvent, handleAgentEvent],
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
      let msg: GatewayPayload
      try {
        msg = JSON.parse(e.data as string) as GatewayPayload
      } catch {
        return
      }
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

      const idempotencyKey = `chat-${Date.now()}`
      const key = config.sessionKey || 'agent:main:webchat:direct:user'

      sendRaw({
        type: 'req',
        method: 'chat.send',
        id: idempotencyKey,
        params: { message: text, idempotencyKey, sessionKey: key },
      })
    },
    [store, sendRaw],
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
        sessionKey: config.sessionKey || 'agent:main:webchat:direct:user',
      },
    })
    stopStreaming()
    store.getState().addSystemMessage('Run aborted.', 'warn')
  }, [store, sendRaw, stopStreaming])

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
