import { supabase } from '@/lib/supabase'

/** Table used for a minimal read probe (exists after migrations). */
const PROBE_TABLE = 'profiles'

export type PingSupabaseResult =
  | { ok: true }
  | { ok: false; reason: 'unconfigured' | 'error'; message: string }

export async function pingSupabase(): Promise<PingSupabaseResult> {
  if (!supabase) {
    return {
      ok: false,
      reason: 'unconfigured',
      message: 'Supabase URL or key is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY.',
    }
  }

  const { error } = await supabase.from(PROBE_TABLE).select('id').limit(1)

  if (error) {
    return {
      ok: false,
      reason: 'error',
      message: error.message || 'Connection failed',
    }
  }

  return { ok: true }
}
