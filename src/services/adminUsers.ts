import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

export async function listProfilesForAdmin(): Promise<{ rows: Profile[]; error: string | null }> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as Profile[], error: null }
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
