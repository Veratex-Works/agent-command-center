import { create } from 'zustand'
import type { ChatMessage, Config, ConnectionStatus, SystemVariant } from '@/types'
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
}

let msgCounter = 0
const nextId = () => `msg-${++msgCounter}`

const initialConfig = loadConfig()

export const useChatStore = create<ChatStore>((set) => ({
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
}))
