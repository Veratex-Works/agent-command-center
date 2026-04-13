import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type {
  BotDeployment,
  BotDeploymentInfra,
  BotDeploymentStatus,
  DeploymentEnv,
  Profile,
} from '@/types/database'

export type BotDeploymentWithAssignee = BotDeployment & {
  assignee: Pick<Profile, 'id' | 'email'> | null
  infra: BotDeploymentInfra | null
}

function parseInfraEmbed(
  botDeploymentId: string,
  raw: unknown,
): BotDeploymentInfra | null {
  if (raw == null) return null
  const list = Array.isArray(raw) ? raw : [raw]
  const row = list[0] as Record<string, unknown> | undefined
  if (!row) return null
  return {
    bot_deployment_id: (row.bot_deployment_id as string) ?? botDeploymentId,
    provider_vm_id: (row.provider_vm_id as string | null) ?? null,
    vps_public_ipv4: (row.vps_public_ipv4 as string | null) ?? null,
    agent_base_url: (row.agent_base_url as string | null) ?? null,
    last_deployed_at: (row.last_deployed_at as string | null) ?? null,
    last_provisioned_at: (row.last_provisioned_at as string | null) ?? null,
    updated_at: row.updated_at as string,
  }
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

export type ListBotDeploymentsResult = {
  rows: BotDeploymentWithAssignee[]
  error: string | null
}

export async function listBotDeployments(): Promise<ListBotDeploymentsResult> {
  if (!supabase) return { rows: [], error: null }
  const { data, error } = await supabase.from('bot_deployments').select(`
      id,
      customer_label,
      status,
      assigned_user_id,
      deployment_env,
      created_at,
      updated_at,
      bot_deployment_infra (
        bot_deployment_id,
        provider_vm_id,
        vps_public_ipv4,
        agent_base_url,
        last_deployed_at,
        last_provisioned_at,
        updated_at
      )
    `)
    .order('created_at', { ascending: false })

  if (error) return { rows: [], error: error.message }
  if (!data?.length) return { rows: [], error: null }

  const assignedIds = data
    .map((row) => (row as { assigned_user_id: string | null }).assigned_user_id)
    .filter((id): id is string => !!id)

  let profileById = new Map<string, Pick<Profile, 'id' | 'email'>>()
  if (assignedIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, email').in('id', assignedIds)
    if (profs) profileById = new Map(profs.map((p) => [p.id, p as Pick<Profile, 'id' | 'email'>]))
  }

  const rows = data.map((row) => {
    const r = row as Record<string, unknown>
    const uid = r.assigned_user_id as string | null
    const id = r.id as string
    return {
      ...mapRow(r),
      assignee: uid ? profileById.get(uid) ?? { id: uid, email: null } : null,
      infra: parseInfraEmbed(id, r.bot_deployment_infra),
    }
  })
  return { rows, error: null }
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
  if (!data) {
    return {
      deployment: null,
      error:
        'Create did not return a row (often RLS or network). Check you are signed in as superadmin.',
    }
  }
  return { deployment: mapRow(data as Record<string, unknown>), error: null }
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
  const { data, error } = await supabase
    .from('bot_deployments')
    .update(patch)
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) {
    return {
      error:
        'No deployment was updated (id not found or removed). Click “Cancel edit” and save a new draft.',
    }
  }
  return { error: null }
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

export type DeployBotInvokeResult = {
  ok: boolean
  stage?: string
  error?: string
  details?: string
  /** n8n response status when webhook failed */
  webhookHttpStatus?: number
}

type EdgeDeployJson = {
  ok?: boolean
  error?: string
  stage?: string
  details?: string
  status?: number
}

function messageFromFunctionsFetchContext(context: unknown): string | undefined {
  if (context instanceof Error) return context.message
  if (typeof context === 'string' && context.trim()) return context.trim().slice(0, 500)
  return undefined
}

async function parseDeployBotInvoke(
  data: unknown,
  error: unknown,
): Promise<DeployBotInvokeResult> {
  if (!error) {
    const body = (data ?? {}) as EdgeDeployJson
    if (body.ok === true) {
      return { ok: true, stage: body.stage }
    }
    if (typeof body.error === 'string') {
      return {
        ok: false,
        stage: body.stage,
        error: body.error,
        details: body.details,
        webhookHttpStatus: typeof body.status === 'number' ? body.status : undefined,
      }
    }
    return {
      ok: false,
      stage: 'unexpected',
      error: 'Unexpected response from Edge Function.',
    }
  }

  if (error instanceof FunctionsHttpError) {
    const res = error.context
    try {
      const body = (await res.clone().json()) as EdgeDeployJson
      return {
        ok: false,
        stage: body.stage ?? 'edge_http_error',
        error: body.error ?? error.message,
        details: body.details,
        webhookHttpStatus: typeof body.status === 'number' ? body.status : undefined,
      }
    } catch {
      try {
        const text = await res.text()
        return {
          ok: false,
          stage: 'edge_http_error',
          error: error.message,
          details: text ? text.slice(0, 500) : undefined,
        }
      } catch {
        return { ok: false, stage: 'edge_http_error', error: error.message }
      }
    }
  }

  if (error instanceof FunctionsRelayError) {
    return {
      ok: false,
      stage: 'relay_error',
      error: 'Supabase relay could not run the Edge Function.',
    }
  }

  if (error instanceof FunctionsFetchError) {
    const inner = messageFromFunctionsFetchContext(error.context)
    return {
      ok: false,
      stage: 'fetch_error',
      error: 'Could not reach the Edge Function.',
      details: inner,
    }
  }

  return {
    ok: false,
    stage: 'unknown',
    error: error instanceof Error ? error.message : 'Unknown error',
  }
}

export type InvokeDeployBotOptions = {
  updateStackOnly?: boolean
}

export async function invokeDeployBot(
  botDeploymentId: string,
  options?: InvokeDeployBotOptions,
): Promise<DeployBotInvokeResult> {
  if (!supabase) {
    return { ok: false, stage: 'unconfigured', error: 'Supabase is not configured.' }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token?.trim()
  if (!token) {
    return {
      ok: false,
      stage: 'unauthorized',
      error: 'No active session. Sign in again to call deploy.',
    }
  }
  const { data, error } = await supabase.functions.invoke('deploy-bot', {
    body: {
      botDeploymentId,
      ...(options?.updateStackOnly ? { updateStackOnly: true } : {}),
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseDeployBotInvoke(data, error)
}

export async function invokeDeployBotTest(
  botDeploymentId: string,
  options?: InvokeDeployBotOptions,
): Promise<DeployBotInvokeResult> {
  if (!supabase) {
    return { ok: false, stage: 'unconfigured', error: 'Supabase is not configured.' }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token?.trim()
  if (!token) {
    return {
      ok: false,
      stage: 'unauthorized',
      error: 'No active session. Sign in again to test the webhook.',
    }
  }
  const { data, error } = await supabase.functions.invoke('deploy-bot', {
    body: {
      botDeploymentId,
      test: true,
      ...(options?.updateStackOnly ? { updateStackOnly: true } : {}),
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseDeployBotInvoke(data, error)
}

/** User-facing lines for deploy / test webhook outcomes (superadmin UI). */
export function formatDeployBotInvokeMessage(
  result: DeployBotInvokeResult,
  mode: 'deploy' | 'test',
): { headline: string; subline?: string; details?: string } {
  if (result.ok) {
    if (mode === 'test' || result.stage === 'n8n_test_ok') {
      return {
        headline: 'Test webhook succeeded.',
        subline:
          'The Edge Function ran and the n8n test URL returned a successful HTTP response.',
      }
    }
    return {
      headline: 'Deploy webhook succeeded.',
      subline:
        'The Edge Function ran and the n8n production webhook returned a successful HTTP response.',
    }
  }

  const err = result.error ?? 'Request failed.'
  if (result.stage === 'n8n_webhook_failed') {
    const status =
      result.webhookHttpStatus != null ? ` (HTTP ${result.webhookHttpStatus})` : ''
    return {
      headline: `Edge Function OK; n8n webhook failed${status}.`,
      subline: err,
      details: result.details,
    }
  }
  if (result.stage === 'n8n_tls_error') {
    return {
      headline: 'n8n HTTPS certificate not trusted from Supabase Edge.',
      subline: err,
      details: result.details,
    }
  }
  if (result.stage === 'n8n_unreachable') {
    return {
      headline: 'Could not connect to the n8n webhook URL.',
      subline: err,
      details: result.details,
    }
  }
  if (result.stage === 'fetch_error') {
    return {
      headline: 'Could not reach the Edge Function.',
      subline:
        'If the console shows a CORS error on the preflight (OPTIONS), the response was not HTTP 2xx—often the function is not deployed at that URL yet (Supabase returns 404 without full CORS). Run `supabase functions deploy deploy-bot` for the same project as `VITE_SUPABASE_URL`, set secrets, then retry. Also verify local `supabase start`, VPN/firewall, and extensions.',
      details: result.details,
    }
  }
  if (result.stage === 'relay_error') {
    return { headline: 'Edge Function relay error.', subline: err }
  }
  if (result.stage === 'misconfigured') {
    return { headline: 'Edge Function is not configured.', subline: err }
  }
  if (result.stage === 'validation') {
    return { headline: 'Deploy request was rejected.', subline: err, details: result.details }
  }
  if (result.stage === 'not_found') {
    return { headline: 'Deployment not found in database.', subline: err }
  }
  if (result.stage === 'db_error') {
    return { headline: 'Database error in Edge Function.', subline: err }
  }
  if (result.stage === 'unconfigured') {
    return { headline: 'Supabase client is not configured.', subline: err }
  }
  if (result.stage === 'unauthorized') {
    return { headline: 'Not authenticated.', subline: err }
  }
  if (result.stage === 'edge_http_error') {
    return {
      headline: 'Edge Function returned an error.',
      subline: err,
      details: result.details,
    }
  }

  return { headline: err, subline: result.stage ? `Stage: ${result.stage}` : undefined, details: result.details }
}
