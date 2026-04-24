import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useChatStore } from '@/store/useChatStore'
import { getDefaultSessionKeyForUser } from '@/lib/sessionKey'
import type { Config } from '@/types'

interface SettingsPanelProps {
  onAbort: () => void
  onReconnect: () => void
}

interface SettingsFormBodyProps {
  config: Config
  isRunning: boolean
  onAbort: () => void
  onReconnect: () => void
  setConfig: (config: Config) => void
  setSettingsOpen: (open: boolean) => void
}

function SettingsFormBody({
  config,
  isRunning,
  onAbort,
  onReconnect,
  setConfig,
  setSettingsOpen,
}: SettingsFormBodyProps) {
  const { user, profile } = useAuth()
  const isClient = profile?.role === 'user'
  const sessionKeyEditable = profile?.role === 'superadmin'
  const derivedSessionKey = user?.id ? getDefaultSessionKeyForUser(user.id) : ''

  const [url, setUrl] = useState(config.url)
  const [token, setToken] = useState(config.token)
  const [sessionKey, setSessionKey] = useState(config.sessionKey)
  const [showToken, setShowToken] = useState(false)

  const handleClose = () => setSettingsOpen(false)

  if (isClient) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-7 w-full max-w-[420px] flex flex-col gap-[18px]">
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
        <p className="text-muted text-sm leading-relaxed m-0">
          Your gateway URL and token come from the <strong className="text-content">bot deployment</strong> assigned
          to you in Deploy bot. They update automatically after deploy and post-deploy — you cannot change them here.
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">Session lane</span>
          <div className="bg-surface2 border border-border text-muted font-mono text-[13px] px-3 py-2.5 rounded-lg w-full break-all">
            {config.sessionKey.trim() || derivedSessionKey || '—'}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="bg-accent text-base border-none px-5 py-[11px] rounded-lg font-sans text-sm font-bold cursor-pointer transition-all duration-150 hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const handleSave = (e: FormEvent) => {
    e.preventDefault()
    if (isRunning) onAbort()
    const sk = sessionKeyEditable
      ? sessionKey.trim()
      : (config.sessionKey.trim() || derivedSessionKey)
    setConfig({ url: url.trim(), token: token.trim(), sessionKey: sk })
    setSettingsOpen(false)
    onReconnect()
  }

  return (
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
        <div className="flex justify-between items-center gap-2">
          <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
            Auth Token <span className="text-dim normal-case">(optional)</span>
          </label>
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="font-mono text-[11px] text-accent hover:underline shrink-0"
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
        <input
          type={showToken ? 'text' : 'password'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="your-gateway-token"
          autoComplete="off"
          className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none transition-colors duration-200 focus:border-accent placeholder:text-dim w-full"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
          Session Key{' '}
          {sessionKeyEditable ? (
            <span className="text-dim normal-case">(optional)</span>
          ) : (
            <span className="text-dim normal-case">(your account)</span>
          )}
        </label>
        {sessionKeyEditable ? (
          <input
            type="text"
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
            placeholder={
              user?.id
                ? getDefaultSessionKeyForUser(user.id)
                : 'agent:main:webchat:direct:…'
            }
            autoComplete="off"
            spellCheck={false}
            className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none transition-colors duration-200 focus:border-accent placeholder:text-dim w-full"
          />
        ) : (
          <div className="bg-surface2 border border-border text-muted font-mono text-[13px] px-3 py-2.5 rounded-lg w-full break-all">
            {config.sessionKey.trim() || derivedSessionKey || '—'}
          </div>
        )}
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
  )
}

export function SettingsPanel({ onAbort, onReconnect }: SettingsPanelProps) {
  const { isSettingsOpen, setSettingsOpen, config, setConfig, isRunning } = useChatStore()

  if (!isSettingsOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-[rgba(0,0,0,0.7)] backdrop-blur-[4px] flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}
    >
      <SettingsFormBody
        key={`${config.url}\u0000${config.token}\u0000${config.sessionKey}`}
        config={config}
        isRunning={isRunning}
        onAbort={onAbort}
        onReconnect={onReconnect}
        setConfig={setConfig}
        setSettingsOpen={setSettingsOpen}
      />
    </div>
  )
}
