import { supabase } from '@/lib/supabase'
import type { DeployProviderSettings } from '@/types/database'

const PROVIDER_SELECT_WITH_STACK =
  'id, vps_api_base_url, vps_api_token, stack_agent_bearer_token, updated_at'
const PROVIDER_SELECT_LEGACY = 'id, vps_api_base_url, vps_api_token, updated_at'

function isMissingStackAgentColumnError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('stack_agent_bearer_token') && m.includes('does not exist')
}

function mapSettings(row: Record<string, unknown>): DeployProviderSettings {
  return {
    id: row.id as number,
    vps_api_base_url: (row.vps_api_base_url as string | null) ?? null,
    vps_api_token: (row.vps_api_token as string | null) ?? null,
    stack_agent_bearer_token: (row.stack_agent_bearer_token as string | null) ?? null,
    updated_at: row.updated_at as string,
  }
}

export async function fetchDeployProviderSettings(): Promise<{
  settings: DeployProviderSettings | null
  error: string | null
}> {
  if (!supabase) return { settings: null, error: null }

  let { data, error } = await supabase
    .from('deploy_provider_settings')
    .select(PROVIDER_SELECT_WITH_STACK)
    .eq('id', 1)
    .maybeSingle()

  if (error && isMissingStackAgentColumnError(error.message)) {
    const legacy = await supabase
      .from('deploy_provider_settings')
      .select(PROVIDER_SELECT_LEGACY)
      .eq('id', 1)
      .maybeSingle()
    error = legacy.error
    if (legacy.data) {
      data = {
        ...(legacy.data as Record<string, unknown>),
        stack_agent_bearer_token: null,
      } as typeof data
    } else {
      data = null
    }
  }

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

/** Bearer token for optional self-hosted deploy-agent (POST /deploy). Clear with empty string. */
export async function saveStackAgentBearerToken(token: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const trimmed = token.trim()
  const value = trimmed || null

  const { data, error } = await supabase
    .from('deploy_provider_settings')
    .update({ stack_agent_bearer_token: value })
    .eq('id', 1)
    .select('id')
    .maybeSingle()

  if (error) {
    if (isMissingStackAgentColumnError(error.message)) {
      return {
        error:
          'Database is missing column stack_agent_bearer_token. Run Supabase migrations (e.g. supabase db push) or apply 20260413120000_deploy_compose_template.sql, then retry.',
      }
    }
    return { error: error.message }
  }
  if (!data) {
    return {
      error:
        'Could not save stack agent token (row missing). Re-run latest migrations on this Supabase project.',
    }
  }
  return { error: null }
}
