import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  deleteAuthUserAccount,
  listProfilesForAdmin,
  updateProfileRole,
} from '@/services/adminUsers'
import type { Profile } from '@/types/database'

export function AdminUsersPage() {
  const { user } = useAuth()
  const myId = user?.id
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setListError(null)
    const { rows: next, error } = await listProfilesForAdmin()
    setRows(next)
    setListError(error)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const superadminCount = rows.filter((r) => r.role === 'superadmin').length

  const handleRoleChange = async (row: Profile, nextRole: Profile['role']) => {
    if (row.role === nextRole) return
    if (row.role === 'superadmin' && nextRole === 'user' && superadminCount <= 1) {
      setBanner(null)
      setListError('Cannot demote the only superadmin.')
      return
    }
    setBusyId(row.id)
    setListError(null)
    setBanner(null)
    const { error } = await updateProfileRole(row.id, nextRole)
    setBusyId(null)
    if (error) {
      setListError(error)
      return
    }
    setBanner(`Updated role for ${row.email ?? row.id.slice(0, 8)}…`)
    void refresh()
  }

  const handleDelete = async (row: Profile) => {
    if (!myId || row.id === myId) return
    const label = row.email?.trim() || row.id
    if (
      !window.confirm(
        `Permanently delete user “${label}”?\n\n` +
          'This removes their Supabase Auth account. Their profile and chat logs are removed; ' +
          'bot deployments they were assigned to are unassigned. Docker stacks on a VPS are not removed.',
      )
    ) {
      return
    }
    setBusyId(row.id)
    setListError(null)
    setBanner(null)
    const res = await deleteAuthUserAccount(row.id)
    setBusyId(null)
    if (!res.ok) {
      setListError(res.error ?? 'Delete failed.')
      return
    }
    setBanner(`Deleted user “${label}”.`)
    void refresh()
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

      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-accent">
          <Users size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-content m-0">Users</h1>
          <p className="text-muted text-sm mt-2 mb-0 max-w-2xl">
            Manage client accounts and roles. Deleting a user removes their <strong>Auth</strong> login
            and cascaded app data; use <strong>Deploy bot</strong> to remove stacks and infra rows for
            bot deployments separately if needed.
          </p>
        </div>
      </div>

      {banner && <p className="text-emerald-400 font-mono text-[13px] m-0 max-w-2xl">{banner}</p>}
      {listError && (
        <p className="text-red-400 font-mono text-[12px] m-0 max-w-2xl" role="alert">
          {listError}
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => void refresh()}
          className="bg-surface2 border border-border text-content text-sm font-semibold px-4 py-2 rounded-lg hover:border-accent disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-muted text-sm m-0">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted text-sm m-0">No profiles found.</p>
      ) : (
        <div className="border border-border rounded-2xl overflow-hidden max-w-4xl">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-surface2 border-b border-border">
                <th className="p-3 font-semibold text-muted">Email</th>
                <th className="p-3 font-semibold text-muted">Role</th>
                <th className="p-3 font-semibold text-muted">Created</th>
                <th className="p-3 font-semibold text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelf = myId === row.id
                const onlySuperadmin = row.role === 'superadmin' && superadminCount <= 1
                const disableDemote = row.role === 'superadmin' && onlySuperadmin
                return (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className="p-3 font-mono text-[12px] text-content break-all align-top">
                      {row.email ?? '—'}
                      {isSelf ? (
                        <span className="block text-[10px] text-muted mt-1">(you)</span>
                      ) : null}
                    </td>
                    <td className="p-3 align-top">
                      <select
                        value={row.role}
                        disabled={busyId !== null || disableDemote}
                        title={
                          disableDemote
                            ? 'Promote another user to superadmin before demoting this account.'
                            : undefined
                        }
                        onChange={(e) =>
                          void handleRoleChange(row, e.target.value as Profile['role'])
                        }
                        className="bg-surface2 border border-border text-content font-mono text-[12px] px-2 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        <option value="user">user</option>
                        <option value="superadmin">superadmin</option>
                      </select>
                    </td>
                    <td className="p-3 text-dim text-[11px] font-mono align-top whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 align-top">
                      <button
                        type="button"
                        disabled={busyId !== null || isSelf || (row.role === 'superadmin' && onlySuperadmin)}
                        title={
                          isSelf
                            ? 'You cannot delete your own account here.'
                            : row.role === 'superadmin' && onlySuperadmin
                              ? 'Cannot delete the last superadmin.'
                              : 'Delete Auth user and cascaded profile data'
                        }
                        onClick={() => void handleDelete(row)}
                        className="text-red-400 text-xs font-semibold hover:underline disabled:opacity-50"
                      >
                        {busyId === row.id ? '…' : 'Delete user'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
