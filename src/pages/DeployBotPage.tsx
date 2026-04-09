import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  createBotDeployment,
  invokeDeployBot,
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

export function DeployBotPage() {
  const [rows, setRows] = useState<BotDeploymentWithAssignee[]>([])
  const [eligible, setEligible] = useState<Profile[]>([])
  const [customerLabel, setCustomerLabel] = useState('')
  const [env, setEnv] = useState<DeploymentEnv>(emptyEnv)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [list, clients] = await Promise.all([
      listBotDeployments(),
      fetchUnassignedUserProfiles(),
    ])
    setRows(list)
    setEligible(clients)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const resetForm = () => {
    setCustomerLabel('')
    setEnv(emptyEnv())
    setEditingId(null)
    setFormError(null)
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
  }

  const handleSaveDraft = async () => {
    setFormError(null)
    setBanner(null)
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
    }
  }

  const handleSaveAndDeploy = async () => {
    setFormError(null)
    setBanner(null)
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
        const { error: invErr } = await invokeDeployBot(editingId)
        if (invErr) {
          await updateBotDeployment(editingId, { status: 'failed' })
          setFormError(invErr)
          return
        }
        await updateBotDeployment(editingId, { status: 'live' })
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
      const { error: invErr } = await invokeDeployBot(deployment.id)
      if (invErr) {
        await updateBotDeployment(deployment.id, { status: 'failed' })
        setFormError(invErr)
        return
      }
      await updateBotDeployment(deployment.id, { status: 'live' })
      setBanner('Deploy triggered.')
      resetForm()
      void refresh()
    } finally {
      setFormBusy(false)
    }
  }

  const deployExisting = async (id: string) => {
    setBusyId(id)
    setBanner(null)
    try {
      await updateBotDeployment(id, { status: 'deploying' })
      const { error } = await invokeDeployBot(id)
      if (error) {
        await updateBotDeployment(id, { status: 'failed' })
        setBanner(`Deploy failed: ${error}`)
        return
      }
      await updateBotDeployment(id, { status: 'live' })
      setBanner('Deploy triggered.')
      void refresh()
    } finally {
      setBusyId(null)
    }
  }

  const onAssignChange = async (rowId: string, userId: string) => {
    const uid = userId || null
    setBusyId(rowId)
    const { error } = await updateBotDeployment(rowId, { assigned_user_id: uid })
    setBusyId(null)
    if (error) setBanner(`Assign failed: ${error}`)
    else void refresh()
  }

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
          Store deployment env in Supabase (superadmin only). Deploy calls an Edge Function that
          forwards the payload to n8n (one new VPS per bot). Link unassigned client accounts below.
        </p>
      </div>

      {banner && (
        <p className="text-emerald-400 font-mono text-[13px] m-0 max-w-2xl">{banner}</p>
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
              <input
                type={key.includes('KEY') || key.includes('TOKEN') ? 'password' : 'text'}
                value={env[key] ?? ''}
                onChange={(e) => setEnv((prev) => ({ ...prev, [key]: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
                className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none focus:border-accent w-full"
              />
            </div>
          ))}
        </div>

        {formError && <p className="text-red-400 font-mono text-[12px] m-0">{formError}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={formBusy || busyId !== null}
            onClick={() => void handleSaveDraft()}
            className="bg-surface2 border border-border text-content font-sans text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {editingId ? 'Save changes' : 'Save draft'}
          </button>
          <button
            type="button"
            disabled={formBusy || busyId !== null}
            onClick={() => void handleSaveAndDeploy()}
            className="bg-accent text-base border-none font-sans text-sm font-bold px-4 py-2 rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-50"
          >
            {formBusy ? '…' : editingId ? 'Save & deploy' : 'Create & deploy'}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3 max-w-4xl">
        <h2 className="text-lg font-bold text-content m-0">Deployments</h2>
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
