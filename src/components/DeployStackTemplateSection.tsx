import { useEffect, useState } from 'react'
import { DeployBotSecretField } from '@/components/DeployBotSecretField'
import {
  fetchDeployComposeTemplate,
  saveDeployComposeTemplate,
} from '@/services/deployComposeTemplate'
import {
  fetchDeployProviderSettings,
  saveStackAgentBearerToken,
} from '@/services/deployProviderSettings'

type DeployStackTemplateSectionProps = {
  onSaved?: () => void
}

export function DeployStackTemplateSection({ onSaved }: DeployStackTemplateSectionProps) {
  const [composeYaml, setComposeYaml] = useState('')
  const [stackAgentToken, setStackAgentToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [composeRes, providerRes] = await Promise.all([
        fetchDeployComposeTemplate(),
        fetchDeployProviderSettings(),
      ])
      if (cancelled) return
      setLoading(false)
      if (composeRes.error) {
        setError(composeRes.error)
        return
      }
      if (providerRes.error) {
        setError(providerRes.error)
        return
      }
      setComposeYaml(composeRes.template?.compose_yaml ?? '')
      setStackAgentToken(providerRes.settings?.stack_agent_bearer_token ?? '')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async () => {
    setError(null)
    setBanner(null)
    setSaving(true)
    try {
      const [composeErr, tokenErr] = await Promise.all([
        saveDeployComposeTemplate(composeYaml),
        saveStackAgentBearerToken(stackAgentToken),
      ])
      if (composeErr.error) {
        setError(composeErr.error)
        return
      }
      if (tokenErr.error) {
        setError(tokenErr.error)
        return
      }
      setBanner(
        'Stack template and agent bearer token saved. n8n loads the template via deploy-webhook-compose; deploy-bot sends a small webhook payload.',
      )
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-surface border border-border rounded-2xl p-6 max-w-3xl flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-content m-0">Stack template (docker-compose)</h2>
        <p className="text-muted text-sm mt-2 mb-0">
          Global <code className="text-[12px]">docker-compose.yml</code> text stored in Supabase. n8n
          fetches it from the <code className="text-[12px]">deploy-webhook-compose</code> Edge Function
          (small webhook + <code className="text-[12px]">composeFetchUrl</code>) so large YAML is not
          inlined in the webhook body. The stack agent bearer token is sent as{' '}
          <code className="text-[12px]">stackAgent.bearerToken</code> for{' '}
          <code className="text-[12px]">Authorization</code> on <code className="text-[12px]">POST /deploy</code>{' '}
          only (not for Hostinger).
        </p>
      </div>

      {loading ? (
        <p className="text-muted text-sm m-0">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
              Stack agent bearer token
            </label>
            <DeployBotSecretField isSecret value={stackAgentToken} onChange={setStackAgentToken} />
            <p className="text-dim text-[11px] m-0">
              Must match <code className="text-[11px]">DEPLOY_AGENT_SECRET</code> on the VPS deploy
              agent.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
              Compose YAML
            </label>
            <textarea
              value={composeYaml}
              onChange={(e) => setComposeYaml(e.target.value)}
              spellCheck={false}
              rows={18}
              className="bg-surface2 border border-border text-content font-mono text-[12px] leading-relaxed px-3 py-2.5 rounded-lg outline-none focus:border-accent w-full min-h-[280px] resize-y"
            />
          </div>

          {error && <p className="text-red-400 font-mono text-[12px] m-0">{error}</p>}
          {banner && (
            <p className="text-emerald-400 font-mono text-[13px] m-0 max-w-2xl">{banner}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="bg-surface2 border border-border text-content font-sans text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {saving ? '…' : 'Save stack template & token'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
