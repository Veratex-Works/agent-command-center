import { create } from 'zustand'
import type { ChatMessage, Config, ConnectionStatus, SystemVariant } from '@/types'
import { getDefaultSessionKeyForUser } from '@/lib/sessionKey'
import { loadConfig, saveConfig } from '@/lib/storage'

interface ChatStore {
  // Config
  config: Config
  setConfig: (config: Config) => void

  // Connection
  connectionStatus: ConnectionStatus
  statusText: string
  setStatus: (status: ConnectionStatus, text: string) => void

  // Messages
  messages: ChatMessage[]
  addMessage: (msg: Omit<ChatMessage, 'id'>) => string
  addSystemMessage: (text: string, variant?: SystemVariant) => void
  updateStreamingMessage: (id: string, content: string) => void
  finalizeStreamingMessage: (id: string) => void
  clearMessages: () => void

  // UI state
  isRunning: boolean
  setRunning: (val: boolean) => void
  isSettingsOpen: boolean
  setSettingsOpen: (val: boolean) => void
  showConnectPrompt: boolean
  setShowConnectPrompt: (val: boolean) => void
  isTyping: boolean
  setTyping: (val: boolean) => void

  /** Last gateway `heartbeat` event (not shown in chat). */
  heartbeatIndicator: { at: number; ok: boolean; reason?: string; status?: string } | null
  setHeartbeatIndicator: (v: ChatStore['heartbeatIndicator']) => void

  /** Sign-out: clear persisted gateway + messages (same browser, next login must not inherit). */
  clearChatForLogout: () => void
  /**
   * New signed-in user (or first mount): disconnect is handled by ChatPage; this clears overlap
   * and optionally strips gateway credentials so unassigned users do not use another account's URL.
   */
  bootstrapChatForSignedInUser: (userId: string, clearGateway: boolean) => void
}

let msgCounter = 0
const nextId = () => `msg-${++msgCounter}`

const initialConfig = loadConfig()

export const useChatStore = create<ChatStore>((set, get) => ({
  config: initialConfig,
  setConfig: (config) => {
    saveConfig(config)
    set({ config })
  },

  connectionStatus: 'disconnected',
  statusText: 'disconnected',
  setStatus: (connectionStatus, statusText) => set({ connectionStatus, statusText }),

  messages: [],
  addMessage: (msg) => {
    const id = nextId()
    set((s) => ({ messages: [...s.messages, { ...msg, id }] }))
    return id
  },
  addSystemMessage: (text, variant = '') => {
    const id = nextId()
    set((s) => ({
      messages: [...s.messages, { id, type: 'system', content: text, variant }],
    }))
  },
  updateStreamingMessage: (id, content) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content, streaming: true } : m,
      ),
    }))
  },
  finalizeStreamingMessage: (id) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, streaming: false } : m,
      ),
    }))
  },
  clearMessages: () => set({ messages: [], isTyping: false }),

  isRunning: false,
  setRunning: (isRunning) => set({ isRunning }),
  isSettingsOpen: false,
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  showConnectPrompt: !initialConfig.url,
  setShowConnectPrompt: (showConnectPrompt) => set({ showConnectPrompt }),
  isTyping: false,
  setTyping: (isTyping) => set({ isTyping }),

  heartbeatIndicator: null,
  setHeartbeatIndicator: (heartbeatIndicator) => set({ heartbeatIndicator }),

  clearChatForLogout: () => {
    saveConfig({ url: '', token: '', sessionKey: '' })
    set({
      config: { url: '', token: '', sessionKey: '' },
      messages: [],
      isRunning: false,
      isTyping: false,
      heartbeatIndicator: null,
      connectionStatus: 'disconnected',
      statusText: 'disconnected',
      showConnectPrompt: true,
    })
  },

  bootstrapChatForSignedInUser: (userId, clearGateway) => {
    const sk = getDefaultSessionKeyForUser(userId)
    const prev = get().config
    if (clearGateway) {
      saveConfig({ url: '', token: '', sessionKey: sk })
      set({
        messages: [],
        isRunning: false,
        isTyping: false,
        heartbeatIndicator: null,
        connectionStatus: 'disconnected',
        statusText: 'disconnected',
        showConnectPrompt: true,
        config: { url: '', token: '', sessionKey: sk },
      })
      return
    }
    const next: Config = { ...prev, sessionKey: sk }
    saveConfig(next)
    set({
      messages: [],
      isRunning: false,
      isTyping: false,
      heartbeatIndicator: null,
      connectionStatus: 'disconnected',
      statusText: 'disconnected',
      showConnectPrompt: !next.url?.trim(),
      config: next,
    })
  },
}))
