import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

function createBrowserClient(): SupabaseClient | null {
  if (!url?.trim() || !key?.trim()) return null
  return createClient(url, key)
}

export const supabase: SupabaseClient | null = createBrowserClient()
