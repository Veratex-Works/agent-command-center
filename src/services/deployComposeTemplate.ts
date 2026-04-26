import { supabase } from '@/lib/supabase'
import type { DeployComposeTemplate } from '@/types/database'

function mapRow(row: Record<string, unknown>): DeployComposeTemplate {
  return {
    id: row.id as number,
    compose_yaml: (row.compose_yaml as string) ?? '',
    updated_at: row.updated_at as string,
  }
}

export async function fetchDeployComposeTemplate(): Promise<{
  template: DeployComposeTemplate | null
  error: string | null
}> {
  if (!supabase) return { template: null, error: null }
  const { data, error } = await supabase
    .from('deploy_compose_template')
    .select('id, compose_yaml, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) return { template: null, error: error.message }
  if (!data) return { template: null, error: null }
  return { template: mapRow(data as Record<string, unknown>), error: null }
}

export async function saveDeployComposeTemplate(composeYaml: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const trimmed = composeYaml.trim()
  if (!trimmed) {
    return { error: 'Compose template cannot be empty.' }
  }

  const { data, error } = await supabase
    .from('deploy_compose_template')
    .upsert({ id: 1, compose_yaml: trimmed }, { onConflict: 'id' })
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) {
    return {
      error:
        'Could not save compose template. Re-run latest migrations on this Supabase project (deploy_compose_template).',
    }
  }
  return { error: null }
}
