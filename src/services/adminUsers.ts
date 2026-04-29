import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

/** Superadmin users table: profile plus optional assigned bot container name from infra. */
export type AdminProfileRow = Profile & {
  hasAssignedBot: boolean
  /** From deploy pipeline (`deploy-bot-callback`); null if not recorded yet or no bot. */
  openclaw_bot_container_name: string | null
}

export async function listProfilesForAdmin(): Promise<{
  rows: AdminProfileRow[]
  error: string | null
}> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const [{ data: profiles, error: profErr }, { data: bots, error: botErr }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, role, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('bot_deployments')
      .select('assigned_user_id, bot_deployment_infra ( openclaw_bot_container_name )')
      .not('assigned_user_id', 'is', null),
  ])
  if (profErr) return { rows: [], error: profErr.message }
  if (botErr) return { rows: [], error: botErr.message }

  const containerByUserId = new Map<string, string | null>()
  for (const row of bots ?? []) {
    const uid = (row as { assigned_user_id?: string }).assigned_user_id
    if (!uid) continue
    const rawInfra = (row as { bot_deployment_infra?: unknown }).bot_deployment_infra
    const embed = Array.isArray(rawInfra) ? rawInfra[0] : rawInfra
    const rawName =
      embed && typeof embed === 'object'
        ? (embed as { openclaw_bot_container_name?: string | null }).openclaw_bot_container_name
        : null
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null
    containerByUserId.set(uid, name)
  }

  const rows: AdminProfileRow[] = (profiles ?? []).map((p) => {
    const id = (p as Profile).id
    const hasAssignedBot = containerByUserId.has(id)
    return {
      ...(p as Profile),
      hasAssignedBot,
      openclaw_bot_container_name: hasAssignedBot ? (containerByUserId.get(id) ?? null) : null,
    }
  })

  return { rows, error: null }
}

export async function updateProfileRole(
  userId: string,
  role: Profile['role'],
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  return { error: error?.message ?? null }
}

export type DeleteAuthUserResult = {
  ok: boolean
  error?: string
  stage?: string
}

type EdgeJson = {
  ok?: boolean
  error?: string
  stage?: string
}

async function parseInvoke(data: unknown, error: unknown): Promise<DeleteAuthUserResult> {
  if (!error) {
    const body = (data ?? {}) as EdgeJson
    if (body.ok === true) return { ok: true }
    if (typeof body.error === 'string') {
      return { ok: false, error: body.error, stage: body.stage }
    }
    return { ok: false, error: 'Unexpected response from Edge Function.' }
  }
  if (error instanceof FunctionsHttpError) {
    const res = error.context
    try {
      const body = (await res.clone().json()) as EdgeJson
      return {
        ok: false,
        error: typeof body.error === 'string' ? body.error : error.message,
        stage: body.stage,
      }
    } catch {
      return { ok: false, error: error.message, stage: 'edge_http' }
    }
  }
  if (error instanceof FunctionsRelayError) {
    return { ok: false, error: 'Supabase relay could not run the Edge Function.', stage: 'relay' }
  }
  if (error instanceof FunctionsFetchError) {
    return { ok: false, error: 'Could not reach the Edge Function.', stage: 'fetch' }
  }
  return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
}

/** Removes the user from Supabase Auth (profile + chat_logs cascade; deployments unassign). */
export async function deleteAuthUserAccount(userId: string): Promise<DeleteAuthUserResult> {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.', stage: 'unconfigured' }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token?.trim()
  if (!token) {
    return { ok: false, error: 'No active session.', stage: 'unauthorized' }
  }
  const { data, error } = await supabase.functions.invoke('admin-delete-user', {
    body: { userId },
    headers: { Authorization: `Bearer ${token}` },
  })
  return await parseInvoke(data, error)
}
