import { supabase } from '@/lib/supabase'
import type {
  BotDeployment,
  BotDeploymentStatus,
  DeploymentEnv,
  Profile,
} from '@/types/database'

export type BotDeploymentWithAssignee = BotDeployment & {
  assignee: Pick<Profile, 'id' | 'email'> | null
}

function mapRow(row: Record<string, unknown>): BotDeployment {
  return {
    id: row.id as string,
    customer_label: row.customer_label as string,
    status: row.status as BotDeployment['status'],
    assigned_user_id: (row.assigned_user_id as string | null) ?? null,
    deployment_env: (row.deployment_env as DeploymentEnv) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function listBotDeployments(): Promise<BotDeploymentWithAssignee[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('bot_deployments')
    .select('id, customer_label, status, assigned_user_id, deployment_env, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return []
  if (!data?.length) return []

  const assignedIds = data
    .map((row) => (row as { assigned_user_id: string | null }).assigned_user_id)
    .filter((id): id is string => !!id)

  let profileById = new Map<string, Pick<Profile, 'id' | 'email'>>()
  if (assignedIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, email').in('id', assignedIds)
    if (profs) profileById = new Map(profs.map((p) => [p.id, p as Pick<Profile, 'id' | 'email'>]))
  }

  return data.map((row) => {
    const r = row as Record<string, unknown>
    const uid = r.assigned_user_id as string | null
    return {
      ...mapRow(r),
      assignee: uid ? profileById.get(uid) ?? { id: uid, email: null } : null,
    }
  })
}

export async function createBotDeployment(
  customerLabel: string,
  deploymentEnv: DeploymentEnv,
): Promise<{ deployment: BotDeployment | null; error: string | null }> {
  if (!supabase) return { deployment: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase
    .from('bot_deployments')
    .insert({
      customer_label: customerLabel.trim(),
      status: 'draft',
      deployment_env: deploymentEnv,
    })
    .select()
    .single()

  if (error) return { deployment: null, error: error.message }
  return { deployment: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

export async function updateBotDeployment(
  id: string,
  patch: Partial<{
    customer_label: string
    status: BotDeploymentStatus
    assigned_user_id: string | null | undefined
    deployment_env: DeploymentEnv
  }>,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.from('bot_deployments').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteBotDeployment(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.from('bot_deployments').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Client: RLS returns at most the row assigned to the current user. */
export async function fetchMyBotDeployment(): Promise<BotDeployment | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('bot_deployments').select('*').maybeSingle()
  if (error || !data) return null
  return mapRow(data as Record<string, unknown>)
}

export async function invokeDeployBot(
  botDeploymentId: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const { data, error } = await supabase.functions.invoke('deploy-bot', {
    body: { botDeploymentId },
  })
  if (error) return { error: error.message }
  const body = data as { error?: string; ok?: boolean } | null
  if (body && typeof body.error === 'string') return { error: body.error }
  return { error: null }
}
