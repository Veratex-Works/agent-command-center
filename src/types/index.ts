export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type MessageType = 'user' | 'bot' | 'system'
export type SystemVariant = 'warn' | 'ok' | ''

/** Shown on user bubbles — metadata only (no file bytes in memory). */
export interface ChatOutboundMeta {
  name: string
  mimeType: string
  size: number
}

/** Parsed from assistant `content` blocks (URLs, inline base64, etc.). */
export interface ChatArtifact {
  id: string
  kind: 'image' | 'file'
  name?: string
  mimeType?: string
  /** Remote URL the browser can open or download. */
  href?: string
  /** Raw base64 payload (no `data:` prefix) for local Blob download. */
  dataBase64?: string
}

export interface ChatMessage {
  id: string
  type: MessageType
  content: string
  ts?: string
  variant?: SystemVariant
  streaming?: boolean
  /** When true, render `content` in a `<pre>` (e.g. raw JSON debug for assistant). */
  renderAsPre?: boolean
  attachments?: ChatOutboundMeta[]
  artifacts?: ChatArtifact[]
}

/** Composer → WebSocket `chat.send`. */
export interface ChatSendPayload {
  text: string
  files: File[]
}

export interface Config {
  url: string
  token: string
  sessionKey: string
}

export interface AgentDataChunk {
  text?: string
  content?: string
  done?: boolean
  finished?: boolean
  aborted?: boolean
  /** Agent lifecycle stream (`stream: "lifecycle"`). */
  phase?: string
  endedAt?: number
}

export interface GatewayPayload {
  type?: string
  event?: string
  id?: string
  method?: string
  ok?: boolean
  seq?: number
  error?: {
    message?: string
    details?: {
      code?: string
      recommendedNextStep?: string
    }
  }
  payload?: {
    // connect / hello
    type?: string
    nonce?: string
    auth?: { deviceToken?: string }
    /** `hello-ok.policy` */
    policy?: { maxPayload?: number; maxBufferedBytes?: number; tickIntervalMs?: number }
    requestId?: string
    // chat.history (legacy)
    entries?: HistoryEntry[]
    // chat.history (new format)
    messages?: HistoryMessage[]
    sessionId?: string
    // chat.send ack
    runId?: string
    // chat event (legacy)
    role?: 'assistant' | 'user'
    content?: string
    done?: boolean
    aborted?: boolean
    // agent event
    stream?: string
    data?: AgentDataChunk
    seq?: number
    sessionKey?: string
    ts?: number
    /** Gateway chat sync lane (`event: "chat"`). */
    state?: 'delta' | 'final' | 'aborted' | 'error'
    message?: HistoryMessage
    /** Heartbeat indicator (`event: "heartbeat"`). */
    status?: string
    reason?: string
    indicatorType?: string
    silent?: boolean
    durationMs?: number
  }
}

/** Legacy history format (payload.entries) */
export interface HistoryEntry {
  role: string
  content: string
  ts?: string | number
}

/** New history format (payload.messages) */
export interface ContentBlock {
  type: string
  text?: string
}

export interface HistoryMessage {
  role: string
  content: ContentBlock[] | string
  timestamp?: number
  stopReason?: string
  /** Provider / routing metadata; string or structured payload from some gateways. */
  api?: string | unknown
  provider?: string
  /** Some gateway builds put visible copy here when `content` is empty or tool-only. */
  text?: string
  preview?: string
  parts?: unknown
  payload?: unknown
  annotations?: unknown
  /** OpenClaw gateway transcript envelope when `content` is empty or tool-only. */
  __openclaw?: unknown
}
