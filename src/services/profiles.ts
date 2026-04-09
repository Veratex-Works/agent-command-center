import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return data as Profile
}

/** Superadmin: `role = user` profiles not linked to any bot deployment. */
export async function fetchUnassignedUserProfiles(): Promise<Profile[]> {
  if (!supabase) return []
  const [{ data: bots }, { data: profiles }] = await Promise.all([
    supabase.from('bot_deployments').select('assigned_user_id').not('assigned_user_id', 'is', null),
    supabase.from('profiles').select('*').eq('role', 'user').order('email', { ascending: true }),
  ])
  const assigned = new Set(
    (bots ?? []).map((b: { assigned_user_id: string }) => b.assigned_user_id),
  )
  return (profiles as Profile[]).filter((p) => !assigned.has(p.id))
}
