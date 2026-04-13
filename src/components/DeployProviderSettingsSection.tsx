import { useEffect, useState } from 'react'
import { DeployBotSecretField } from '@/components/DeployBotSecretField'
import {
  fetchDeployProviderSettings,
  saveDeployProviderSettings,
} from '@/services/deployProviderSettings'

type DeployProviderSettingsSectionProps = {
  onSaved?: () => void
}

export function DeployProviderSettingsSection({ onSaved }: DeployProviderSettingsSectionProps) {
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { settings, error: e } = await fetchDeployProviderSettings()
      if (cancelled) return
      setLoading(false)
      if (e) {
        setError(e)
        return
      }
      setBaseUrl(settings?.vps_api_base_url ?? '')
      setToken(settings?.vps_api_token ?? '')
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
      const { error: err } = await saveDeployProviderSettings({
        vps_api_base_url: baseUrl,
        vps_api_token: token,
      })
      if (err) setError(err)
      else {
        setBanner('Provider API settings saved. Deploy will send them to n8n on each run.')
        onSaved?.()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-surface border border-border rounded-2xl p-6 max-w-3xl flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-content m-0">VPS provider API (Hostinger, etc.)</h2>
        <p className="text-muted text-sm mt-2 mb-0">
          Base URL and bearer token are stored in Supabase (not in n8n). The deploy Edge Function
          forwards them in the webhook JSON as <code className="text-[12px]">provider</code> so one
          n8n workflow can call your provider without hard-coding secrets in the flow.
        </p>
      </div>

      {loading ? (
        <p className="text-muted text-sm m-0">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
              VPS API base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://… (from provider docs / Postman collection)"
              autoComplete="off"
              spellCheck={false}
              className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none focus:border-accent w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
              VPS API bearer token
            </label>
            <DeployBotSecretField isSecret value={token} onChange={setToken} />
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
              {saving ? '…' : 'Save provider settings'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
