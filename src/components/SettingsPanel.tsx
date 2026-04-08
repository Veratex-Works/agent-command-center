import { useState, useEffect, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useChatStore } from '@/store/useChatStore'

interface SettingsPanelProps {
  onAbort: () => void
  onReconnect: () => void
}

export function SettingsPanel({ onAbort, onReconnect }: SettingsPanelProps) {
  const { isSettingsOpen, setSettingsOpen, config, setConfig, isRunning } = useChatStore()

  const [url, setUrl] = useState(config.url)
  const [token, setToken] = useState(config.token)
  const [sessionKey, setSessionKey] = useState(config.sessionKey)

  useEffect(() => {
    if (isSettingsOpen) {
      setUrl(config.url)
      setToken(config.token)
      setSessionKey(config.sessionKey)
    }
  }, [isSettingsOpen, config])

  const handleClose = () => setSettingsOpen(false)

  const handleSave = (e: FormEvent) => {
    e.preventDefault()
    if (isRunning) onAbort()
    setConfig({ url: url.trim(), token: token.trim(), sessionKey: sessionKey.trim() })
    setSettingsOpen(false)
    onReconnect()
  }

  if (!isSettingsOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-[rgba(0,0,0,0.7)] backdrop-blur-[4px] flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <form
        onSubmit={handleSave}
        className="bg-surface border border-border rounded-2xl p-7 w-full max-w-[420px] flex flex-col gap-[18px]"
      >
        <div className="flex justify-between items-center text-lg font-bold text-content">
          Settings
          <button
            type="button"
            onClick={handleClose}
            className="bg-surface2 border border-border text-muted w-[34px] h-[34px] rounded-lg cursor-pointer flex items-center justify-center transition-all duration-150 hover:border-accent hover:text-accent"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
            Gateway URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="wss://your-tunnel.trycloudflare.com"
            autoComplete="off"
            spellCheck={false}
            className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none transition-colors duration-200 focus:border-accent placeholder:text-dim w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
            Auth Token <span className="text-dim normal-case">(optional)</span>
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="your-gateway-token"
            autoComplete="off"
            className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none transition-colors duration-200 focus:border-accent placeholder:text-dim w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
            Session Key <span className="text-dim normal-case">(optional)</span>
          </label>
          <input
            type="text"
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
            placeholder="agent:main:webchat:direct:user"
            autoComplete="off"
            spellCheck={false}
            className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none transition-colors duration-200 focus:border-accent placeholder:text-dim w-full"
          />
        </div>

        <div className="flex gap-2.5 justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="bg-transparent text-muted border border-border px-5 py-[11px] rounded-lg font-sans text-sm font-semibold cursor-pointer transition-all duration-150 hover:border-muted hover:text-content"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-accent text-base border-none px-5 py-[11px] rounded-lg font-sans text-sm font-bold cursor-pointer transition-all duration-150 hover:opacity-90 hover:-translate-y-px active:translate-y-0 tracking-[0.02em]"
          >
            Save & Reconnect
          </button>
        </div>
      </form>
    </div>
  )
}
