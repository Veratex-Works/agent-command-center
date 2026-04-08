export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type MessageType = 'user' | 'bot' | 'system'
export type SystemVariant = 'warn' | 'ok' | ''

export interface ChatMessage {
  id: string
  type: MessageType
  content: string
  ts?: string
  variant?: SystemVariant
  streaming?: boolean
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
    state?: 'delta' | 'final'
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
  api?: string
  provider?: string
}
