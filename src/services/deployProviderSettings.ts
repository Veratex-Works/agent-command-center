import { supabase } from '@/lib/supabase'
import type { DeployProviderSettings } from '@/types/database'

function mapSettings(row: Record<string, unknown>): DeployProviderSettings {
  return {
    id: row.id as number,
    vps_api_base_url: (row.vps_api_base_url as string | null) ?? null,
    vps_api_token: (row.vps_api_token as string | null) ?? null,
    updated_at: row.updated_at as string,
  }
}

export async function fetchDeployProviderSettings(): Promise<{
  settings: DeployProviderSettings | null
  error: string | null
}> {
  if (!supabase) return { settings: null, error: null }
  const { data, error } = await supabase
    .from('deploy_provider_settings')
    .select('id, vps_api_base_url, vps_api_token, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) return { settings: null, error: error.message }
  if (!data) return { settings: null, error: null }
  return { settings: mapSettings(data as Record<string, unknown>), error: null }
}

export async function saveDeployProviderSettings(patch: {
  vps_api_base_url: string
  vps_api_token: string
}): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const { data, error } = await supabase
    .from('deploy_provider_settings')
    .update({
      vps_api_base_url: patch.vps_api_base_url.trim() || null,
      vps_api_token: patch.vps_api_token.trim() || null,
    })
    .eq('id', 1)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) {
    return {
      error:
        'Could not save provider settings (row missing). Re-run latest migrations on this Supabase project.',
    }
  }
  return { error: null }
}
