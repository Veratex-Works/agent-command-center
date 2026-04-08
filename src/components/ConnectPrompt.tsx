import { useState, type FormEvent } from 'react'
import { useChatStore } from '@/store/useChatStore'

interface ConnectPromptProps {
  onConnect: () => void
}

export function ConnectPrompt({ onConnect }: ConnectPromptProps) {
  const { setConfig, setShowConnectPrompt } = useChatStore()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) {
      setError('Please enter a Gateway URL.')
      return
    }
    setError('')
    setConfig({ url: url.trim(), token: token.trim(), sessionKey: '' })
    setShowConnectPrompt(false)
    onConnect()
  }

  return (
    <div className="fixed inset-0 z-50 bg-base flex items-center justify-center p-5">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border rounded-[20px] p-9 w-full max-w-[400px] flex flex-col gap-5"
      >
        <div className="text-[28px] font-extrabold text-accent tracking-[-1px]">
          OpenClaw <span className="text-muted">chat</span>
        </div>

        <p className="font-mono text-sm text-muted leading-relaxed">
          Enter your OpenClaw Gateway URL and token to connect.
        </p>

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

        {error && (
          <div className="font-mono text-xs text-danger bg-[rgba(255,90,90,0.08)] border border-[#5a2020] px-3 py-2.5 rounded-lg">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="bg-accent text-base border-none px-5 py-[11px] rounded-lg font-sans text-sm font-bold cursor-pointer transition-all duration-150 hover:opacity-90 hover:-translate-y-px active:translate-y-0 tracking-[0.02em]"
        >
          Connect →
        </button>
      </form>
    </div>
  )
}
