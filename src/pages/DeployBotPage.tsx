import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { DeployBotSecretField } from '@/components/DeployBotSecretField'
import { DeployProviderSettingsSection } from '@/components/DeployProviderSettingsSection'
import { DeployStackTemplateSection } from '@/components/DeployStackTemplateSection'
import { useAuth } from '@/hooks/useAuth'
import { useDeployBotSessionDraft } from '@/hooks/useDeployBotSessionDraft'
import { clearDeployBotSessionDraft } from '@/lib/deployBotSessionDraft'
import {
  createBotDeployment,
  formatDeployBotInvokeMessage,
  invokeDeployBot,
  invokeDeployBotTest,
  listBotDeployments,
  updateBotDeployment,
  type BotDeploymentWithAssignee,
} from '@/services/botDeployments'
import { fetchUnassignedUserProfiles } from '@/services/profiles'
import { DEPLOYMENT_ENV_KEYS, type DeploymentEnv } from '@/types/database'
import type { Profile } from '@/types/database'

function emptyEnv(): DeploymentEnv {
  return Object.fromEntries(DEPLOYMENT_ENV_KEYS.map((k) => [k, ''])) as DeploymentEnv
}

function normalizeEnv(raw: DeploymentEnv): DeploymentEnv {
  const out: DeploymentEnv = {}
  for (const k of DEPLOYMENT_ENV_KEYS) {
    const v = raw[k]?.trim()
    if (v) out[k] = v
  }
  return out
}

function isSecretEnvKey(key: string) {
  return key.includes('KEY') || key.includes('TOKEN')
}

type InvokeFeedback = {
  tone: 'success' | 'error'
  headline: string
  subline?: string
  details?: string
}

export function DeployBotPage() {
  const { user } = useAuth()
  const userId = user?.id

  const [rows, setRows] = useState<BotDeploymentWithAssignee[]>([])
  const [eligible, setEligible] = useState<Profile[]>([])
  const [customerLabel, setCustomerLabel] = useState('')
  const [env, setEnv] = useState<DeploymentEnv>(emptyEnv)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [invokeFeedback, setInvokeFeedback] = useState<InvokeFeedback | null>(null)
  const [updateStackOnly, setUpdateStackOnly] = useState(false)

  useDeployBotSessionDraft(
    userId,
    customerLabel,
    env,
    editingId,
    setCustomerLabel,
    setEnv,
    setEditingId,
  )

  const refresh = useCallback(async () => {
    const [listRes, clients] = await Promise.all([
      listBotDeployments(),
      fetchUnassignedUserProfiles(),
    ])
    setRows(listRes.rows)
    setListError(listRes.error)
    setEligible(clients)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Session draft can keep an editingId after rows were deleted in the DB (e.g. table cleared). */
  useEffect(() => {
    if (loading || !editingId) return
    if (rows.some((r) => r.id === editingId)) return
    setEditingId(null)
    setFormError(
      'The deployment you were editing is gone (e.g. table was cleared). Switched to new deployment — use Save draft to create a row.',
    )
  }, [loading, editingId, rows])

  const clearSessionDraft = () => {
    if (userId) clearDeployBotSessionDraft(userId)
  }

  const resetForm = () => {
    setCustomerLabel('')
    setEnv(emptyEnv())
    setEditingId(null)
    setFormError(null)
    clearSessionDraft()
  }

  const loadRowForEdit = (row: BotDeploymentWithAssignee) => {
    setEditingId(row.id)
    setCustomerLabel(row.customer_label)
    const merged = emptyEnv()
    for (const k of DEPLOYMENT_ENV_KEYS) {
      const v = row.deployment_env[k]
      if (v) merged[k] = v
    }
    setEnv(merged)
    setFormError(null)
    setInvokeFeedback(null)
  }

  const handleSaveDraft = async () => {
    setFormError(null)
    setBanner(null)
    setInvokeFeedback(null)
    const label = customerLabel.trim()
    if (!label) {
      setFormError('Customer name / label is required.')
      return
    }
    const payload = normalizeEnv(env)
    if (editingId) {
      const { error } = await updateBotDeployment(editingId, {
        customer_label: label,
        deployment_env: payload,
      })
      if (error) setFormError(error)
      else {
        setBanner('Saved.')
        void refresh()
      }
      return
    }
    const { deployment, error } = await createBotDeployment(label, payload)
    if (error) setFormError(error)
    else if (deployment) {
      setBanner(`Created draft ${deployment.id.slice(0, 8)}…`)
      resetForm()
      void refresh()
    } else {
      setFormError('Create finished without a row. Check network and RLS (superadmin required).')
    }
  }

  const handleSaveAndDeploy = async () => {
    setFormError(null)
    setBanner(null)
    setInvokeFeedback(null)
    const label = customerLabel.trim()
    if (!label) {
      setFormError('Customer name / label is required.')
      return
    }
    const payload = normalizeEnv(env)
    setFormBusy(true)
    try {
      if (editingId) {
        const { error: upErr } = await updateBotDeployment(editingId, {
          customer_label: label,
          deployment_env: payload,
          status: 'deploying',
        })
        if (upErr) {
          setFormError(upErr)
          return
        }
        const inv = await invokeDeployBot(editingId, { updateStackOnly })
        if (!inv.ok) {
          await updateBotDeployment(editingId, { status: 'failed' })
          const msg = formatDeployBotInvokeMessage(inv, 'deploy')
          setInvokeFeedback({
            tone: 'error',
            headline: msg.headline,
            subline: msg.subline,
            details: msg.details,
          })
          return
        }
        await updateBotDeployment(editingId, { status: 'live' })
        const msg = formatDeployBotInvokeMessage(inv, 'deploy')
        setInvokeFeedback({
          tone: 'success',
          headline: msg.headline,
          subline: msg.subline,
        })
        setBanner('Deploy triggered.')
        resetForm()
        void refresh()
        return
      }
      const { deployment, error: cErr } = await createBotDeployment(label, payload)
      if (cErr || !deployment) {
        setFormError(cErr ?? 'Create failed.')
        return
      }
      await updateBotDeployment(deployment.id, { status: 'deploying' })
      const inv = await invokeDeployBot(deployment.id, { updateStackOnly })
      if (!inv.ok) {
        await updateBotDeployment(deployment.id, { status: 'failed' })
        const msg = formatDeployBotInvokeMessage(inv, 'deploy')
        setInvokeFeedback({
          tone: 'error',
          headline: msg.headline,
          subline: msg.subline,
          details: msg.details,
        })
        return
      }
      await updateBotDeployment(deployment.id, { status: 'live' })
      const msg = formatDeployBotInvokeMessage(inv, 'deploy')
      setInvokeFeedback({
        tone: 'success',
        headline: msg.headline,
        subline: msg.subline,
      })
      setBanner('Deploy triggered.')
      resetForm()
      void refresh()
    } finally {
      setFormBusy(false)
    }
  }

  const handleTestN8n = async () => {
    if (!editingId) return
    setFormError(null)
    setBanner(null)
    setInvokeFeedback(null)
    setTestBusy(true)
    try {
      const inv = await invokeDeployBotTest(editingId, { updateStackOnly })
      const msg = formatDeployBotInvokeMessage(inv, 'test')
      setInvokeFeedback({
        tone: inv.ok ? 'success' : 'error',
        headline: msg.headline,
        subline: msg.subline,
        details: msg.details,
      })
      if (inv.ok) setBanner('n8n test webhook OK.')
    } finally {
      setTestBusy(false)
    }
  }

  const deployExisting = async (id: string) => {
    setBusyId(id)
    setBanner(null)
    setInvokeFeedback(null)
    try {
      await updateBotDeployment(id, { status: 'deploying' })
      const inv = await invokeDeployBot(id, { updateStackOnly })
      if (!inv.ok) {
        await updateBotDeployment(id, { status: 'failed' })
        const msg = formatDeployBotInvokeMessage(inv, 'deploy')
        setInvokeFeedback({
          tone: 'error',
          headline: msg.headline,
          subline: msg.subline,
          details: msg.details,
        })
        return
      }
      await updateBotDeployment(id, { status: 'live' })
      const msg = formatDeployBotInvokeMessage(inv, 'deploy')
      setInvokeFeedback({
        tone: 'success',
        headline: msg.headline,
        subline: msg.subline,
      })
      setBanner('Deploy triggered.')
      void refresh()
    } finally {
      setBusyId(null)
    }
  }

  const onAssignChange = async (rowId: string, userIdToAssign: string) => {
    const uid = userIdToAssign || null
    setBusyId(rowId)
    const { error } = await updateBotDeployment(rowId, { assigned_user_id: uid })
    setBusyId(null)
    if (error) setBanner(`Assign failed: ${error}`)
    else void refresh()
  }

  const buttonsDisabled = formBusy || testBusy || busyId !== null

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto p-5 gap-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-muted text-sm font-semibold hover:text-accent transition-colors"
        >
          <ArrowLeft size={16} />
          Back to chat
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-content m-0">Deploy bot</h1>
        <p className="text-muted text-sm mt-2 mb-0 max-w-2xl">
          Per-bot secrets live in <code className="text-[12px]">deployment_env</code>. VPS provider
          API URL/token, global compose template, stack-agent bearer token, and per-server metadata
          (IP, VM id, agent URL) live in separate tables. Deploy sends{' '}
          <code className="text-[12px]">composeFetchUrl</code> and{' '}
          <code className="text-[12px]">stackAgent</code> to n8n so the VPS agent can write files and
          run compose; branch in n8n: full provision vs update stack only.
        </p>
      </div>

      <DeployProviderSettingsSection onSaved={() => void refresh()} />

      <DeployStackTemplateSection onSaved={() => void refresh()} />

      <div className="flex flex-col gap-2 max-w-3xl">
        <label className="flex items-start gap-2.5 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border"
            checked={updateStackOnly}
            onChange={(e) => setUpdateStackOnly(e.target.checked)}
          />
          <span>
            <span className="font-semibold text-content">Update stack only</span>
            <span className="block text-[12px] text-dim mt-0.5">
              Skip creating a new VPS; n8n should redeploy on the existing host using{' '}
              <code className="text-[11px]">agentBaseUrl</code> or <code className="text-[11px]">vpsPublicIpv4</code>{' '}
              from the table below (filled after first provision via callback).
            </span>
          </span>
        </label>
      </div>

      {banner && (
        <p className="text-emerald-400 font-mono text-[13px] m-0 max-w-2xl">{banner}</p>
      )}

      {invokeFeedback && (
        <div
          className={
            invokeFeedback.tone === 'error'
              ? 'text-red-400 max-w-3xl'
              : 'text-emerald-400 max-w-3xl'
          }
        >
          <p className="font-mono text-[13px] m-0 font-semibold">{invokeFeedback.headline}</p>
          {invokeFeedback.subline && (
            <p className="text-muted text-[12px] mt-1.5 mb-0 font-sans">{invokeFeedback.subline}</p>
          )}
          {invokeFeedback.details ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] font-semibold text-muted hover:text-content">
                Response details
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-surface2 border border-border text-[11px] text-content overflow-x-auto whitespace-pre-wrap break-all">
                {invokeFeedback.details}
              </pre>
            </details>
          ) : null}
        </div>
      )}

      <section className="bg-surface border border-border rounded-2xl p-6 max-w-3xl flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-content m-0">
            {editingId ? 'Edit deployment' : 'New deployment'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-muted text-xs font-semibold hover:text-accent"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
            Customer name / label
          </label>
          <input
            type="text"
            value={customerLabel}
            onChange={(e) => setCustomerLabel(e.target.value)}
            placeholder="e.g. acme-corp"
            className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none focus:border-accent w-full"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-1">
          {DEPLOYMENT_ENV_KEYS.map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
                {key}
              </label>
              <DeployBotSecretField
                isSecret={isSecretEnvKey(key)}
                value={env[key] ?? ''}
                onChange={(v) => setEnv((prev) => ({ ...prev, [key]: v }))}
              />
            </div>
          ))}
        </div>

        {formError && <p className="text-red-400 font-mono text-[12px] m-0">{formError}</p>}

        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={buttonsDisabled}
            onClick={() => void handleSaveDraft()}
            className="bg-surface2 border border-border text-content font-sans text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {editingId ? 'Save changes' : 'Save draft'}
          </button>
          <button
            type="button"
            disabled={buttonsDisabled}
            onClick={() => void handleSaveAndDeploy()}
            className="bg-accent text-base border-none font-sans text-sm font-bold px-4 py-2 rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-50"
          >
            {formBusy ? '…' : editingId ? 'Save & deploy' : 'Create & deploy'}
          </button>
          <button
            type="button"
            disabled={buttonsDisabled || !editingId}
            title={!editingId ? 'Save draft first to test the n8n test webhook.' : undefined}
            onClick={() => void handleTestN8n()}
            className="bg-surface2 border border-border text-content font-sans text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {testBusy ? '…' : 'Test n8n'}
          </button>
          {!editingId && (
            <span className="text-dim text-[11px] font-sans">Save draft first to enable Test n8n.</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 max-w-4xl">
        <h2 className="text-lg font-bold text-content m-0">Deployments</h2>
        {listError && (
          <p className="text-amber-400 font-mono text-[12px] m-0 max-w-2xl">
            Could not load deployments: {listError}
          </p>
        )}
        {loading ? (
          <p className="text-muted text-sm m-0">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted text-sm m-0">No deployments yet.</p>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-surface2 border-b border-border">
                  <th className="p-3 font-semibold text-muted">Label</th>
                  <th className="p-3 font-semibold text-muted">Status</th>
                  <th className="p-3 font-semibold text-muted min-w-[100px]">Infra</th>
                  <th className="p-3 font-semibold text-muted">Assigned</th>
                  <th className="p-3 font-semibold text-muted">Link client</th>
                  <th className="p-3 font-semibold text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className="p-3 font-mono text-[13px] text-content align-top">
                      {row.customer_label}
                    </td>
                    <td className="p-3 text-muted align-top">{row.status}</td>
                    <td className="p-3 text-dim align-top text-[11px] font-mono leading-snug max-w-[220px]">
                      <div>VM: {row.infra?.provider_vm_id ?? '—'}</div>
                      <div className="mt-1">IP: {row.infra?.vps_public_ipv4 ?? '—'}</div>
                      <div
                        className="mt-1 break-all text-[10px]"
                        title={row.infra?.agent_base_url ?? undefined}
                      >
                        {row.infra?.agent_base_url ?? '—'}
                      </div>
                      <div className="mt-1 text-[10px] text-muted">
                        Last deploy:{' '}
                        {row.infra?.last_deployed_at
                          ? new Date(row.infra.last_deployed_at).toLocaleString()
                          : '—'}
                      </div>
                    </td>
                    <td className="p-3 text-muted align-top break-all">
                      {row.assignee?.email ?? '—'}
                    </td>
                    <td className="p-3 align-top min-w-[200px]">
                      {row.assigned_user_id ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-muted text-[13px] break-all">
                            {row.assignee?.email ?? row.assigned_user_id}
                          </span>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="text-left text-xs text-accent font-semibold hover:underline disabled:opacity-50"
                            onClick={() => void onAssignChange(row.id, '')}
                          >
                            Unassign
                          </button>
                        </div>
                      ) : (
                        <select
                          disabled={busyId === row.id}
                          value=""
                          onChange={(e) => void onAssignChange(row.id, e.target.value)}
                          className="bg-surface2 border border-border text-content font-mono text-[12px] px-2 py-1.5 rounded-lg w-full max-w-[220px] disabled:opacity-60"
                        >
                          <option value="">— choose client —</option>
                          {eligible.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.email ?? p.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void deployExisting(row.id)}
                        className="text-accent text-xs font-semibold hover:underline mr-3 disabled:opacity-50"
                      >
                        {busyId === row.id ? '…' : 'Deploy'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => loadRowForEdit(row)}
                        className="text-muted text-xs font-semibold hover:text-accent"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
