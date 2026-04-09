import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return data as Profile
}
