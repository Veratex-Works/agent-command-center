import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useChatStore } from '@/store/useChatStore'
import { listBotDeployments, type BotDeploymentWithAssignee } from '@/services/botDeployments'
import { getDefaultSessionKeyForUser } from '@/lib/sessionKey'

interface SuperadminBotConnectPanelProps {
  onConnect: () => void
}

function isConnectableDeployment(row: BotDeploymentWithAssignee): boolean {
  if (!['live', 'deploying'].includes(row.status)) return false
  return Boolean(row.deployment_env.OPENCLAW_GATEWAY_URL?.trim())
}

export function SuperadminBotConnectPanel({ onConnect }: SuperadminBotConnectPanelProps) {
  const { user } = useAuth()
  const setConfig = useChatStore((s) => s.setConfig)
  const setShowConnectPrompt = useChatStore((s) => s.setShowConnectPrompt)

  const [rows, setRows] = useState<BotDeploymentWithAssignee[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { rows: next, error } = await listBotDeployments()
      if (cancelled) return
      setRows(next)
      setListError(error)
      setLoading(false)
      const ok = next.filter(isConnectableDeployment)
      if (ok.length === 1) setSelectedId(ok[0].id)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const connectable = useMemo(() => rows.filter(isConnectableDeployment), [rows])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    const row = connectable.find((r) => r.id === selectedId)
    if (!row) {
      setFormError('Choose a deployment with a gateway URL (live or deploying).')
      return
    }
    const url = row.deployment_env.OPENCLAW_GATEWAY_URL?.trim() ?? ''
    const token = row.deployment_env.OPENCLAW_GATEWAY_TOKEN?.trim() ?? ''
    const sk = user?.id ? getDefaultSessionKeyForUser(user.id) : ''
    setConfig({ url, token, sessionKey: sk })
    setShowConnectPrompt(false)
    onConnect()
  }

  return (
    <div className="fixed inset-0 z-50 bg-base flex items-center justify-center p-5">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border rounded-[20px] p-9 w-full max-w-[440px] flex flex-col gap-5"
      >
        <div className="text-[28px] font-extrabold text-accent tracking-[-1px]">
          OpenClaw <span className="text-muted">chat</span>
        </div>

        <p className="font-mono text-sm text-muted leading-relaxed m-0">
          Superadmin: pick a <strong className="text-content">live or deploying</strong> bot that already has{' '}
          <code className="text-[11px]">OPENCLAW_GATEWAY_URL</code> in its deployment env (after deploy / post-deploy).
        </p>

        {listError && (
          <p className="text-red-400 font-mono text-[12px] m-0" role="alert">
            {listError}
          </p>
        )}

        {loading ? (
          <p className="text-muted text-sm m-0">Loading deployments…</p>
        ) : connectable.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface2 p-4">
            <p className="text-muted text-[13px] m-0 leading-relaxed">
              No deployments are ready to chat yet. Create a draft, assign a client, deploy, then run post-deploy so
              the stack has a gateway URL.
            </p>
            <Link
              to="/deploy-bot"
              className="text-accent text-sm font-semibold hover:underline w-fit"
            >
              Open Deploy bot →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
              Deployment
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              required
              className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none focus:border-accent w-full"
            >
              <option value="">— select —</option>
              {connectable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.customer_label} · {r.status} · {r.id.slice(0, 8)}…
                </option>
              ))}
            </select>
          </div>
        )}

        {formError ? (
          <p className="text-red-400 font-mono text-[12px] m-0" role="alert">
            {formError}
          </p>
        ) : null}

        {connectable.length > 0 ? (
          <button
            type="submit"
            className="bg-accent text-base border-none px-5 py-[11px] rounded-lg font-sans text-sm font-bold cursor-pointer transition-all duration-150 hover:opacity-90 hover:-translate-y-px active:translate-y-0 tracking-[0.02em]"
          >
            Connect to this bot →
          </button>
        ) : null}

        <Link
          to="/deploy-bot"
          className="text-center text-muted text-xs font-semibold hover:text-accent"
        >
          Manage deployments
        </Link>
      </form>
    </div>
  )
}
