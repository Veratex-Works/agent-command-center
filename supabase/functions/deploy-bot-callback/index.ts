import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0?target=deno'
import { corsJson, handleCors } from '../_shared/cors.ts'

const ALLOWED_STATUS = new Set(['draft', 'deploying', 'live', 'failed'])

type CallbackBody = {
  botDeploymentId?: string
  providerVmId?: string | null
  vpsPublicIpv4?: string | null
  agentBaseUrl?: string | null
  deploymentStatus?: string
  /** When true, set last_deployed_at to now() */
  touchLastDeployed?: boolean
  /** When true, set last_provisioned_at to now() */
  touchLastProvisioned?: boolean
}

function env(name: string): string | null {
  const v = Deno.env.get(name)
  return v?.trim() ? v : null
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'POST') {
      return corsJson({ error: 'Method not allowed', stage: 'method_not_allowed' }, 405)
    }

    const secret = env('DEPLOY_BOT_CALLBACK_SECRET')
    if (!secret) {
      return corsJson(
        { error: 'DEPLOY_BOT_CALLBACK_SECRET is not configured', stage: 'misconfigured' },
        500,
      )
    }

    const headerSecret = req.headers.get('x-deploy-callback-secret')?.trim()
    if (!headerSecret || headerSecret !== secret) {
      return corsJson({ error: 'Forbidden', stage: 'forbidden' }, 403)
    }

    const url = env('SUPABASE_URL')
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) {
      return corsJson({ error: 'Server misconfigured', stage: 'edge_env_missing' }, 500)
    }

    let body: CallbackBody
    try {
      body = (await req.json()) as CallbackBody
    } catch {
      return corsJson({ error: 'Invalid JSON', stage: 'invalid_json' }, 400)
    }

    const id = body.botDeploymentId?.trim()
    if (!id) {
      return corsJson({ error: 'botDeploymentId is required', stage: 'validation' }, 400)
    }

    if (body.deploymentStatus !== undefined && body.deploymentStatus !== null) {
      if (!ALLOWED_STATUS.has(body.deploymentStatus)) {
        return corsJson({ error: 'Invalid deploymentStatus', stage: 'validation' }, 400)
      }
    }

    const client = createClient(url, serviceKey)

    const { data: exists, error: exErr } = await client
      .from('bot_deployments')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (exErr) {
      return corsJson({ error: 'Database error', stage: 'db_error' }, 500)
    }
    if (!exists) {
      return corsJson({ error: 'Deployment not found', stage: 'not_found' }, 404)
    }

    const now = new Date().toISOString()

    const infraPatch: Record<string, unknown> = {}
    if (body.providerVmId !== undefined) {
      infraPatch.provider_vm_id = body.providerVmId?.trim() || null
    }
    if (body.vpsPublicIpv4 !== undefined) {
      infraPatch.vps_public_ipv4 = body.vpsPublicIpv4?.trim() || null
    }
    if (body.agentBaseUrl !== undefined) {
      infraPatch.agent_base_url = body.agentBaseUrl?.trim() || null
    }
    if (body.touchLastDeployed === true) {
      infraPatch.last_deployed_at = now
    }
    if (body.touchLastProvisioned === true) {
      infraPatch.last_provisioned_at = now
    }

    if (Object.keys(infraPatch).length > 0) {
      const { data: existing } = await client
        .from('bot_deployment_infra')
        .select('bot_deployment_id')
        .eq('bot_deployment_id', id)
        .maybeSingle()

      const err = existing
        ? (await client.from('bot_deployment_infra').update(infraPatch).eq('bot_deployment_id', id))
            .error
        : (
            await client
              .from('bot_deployment_infra')
              .insert({ bot_deployment_id: id, ...infraPatch })
          ).error

      if (err) {
        return corsJson({ error: 'Failed to update infra', stage: 'db_error' }, 500)
      }
    }

    if (body.deploymentStatus) {
      const { error: stErr } = await client
        .from('bot_deployments')
        .update({ status: body.deploymentStatus })
        .eq('id', id)
      if (stErr) {
        return corsJson({ error: 'Failed to update status', stage: 'db_error' }, 500)
      }
    }

    return corsJson({ ok: true, stage: 'callback_ok' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return corsJson(
      {
        error: 'Unhandled error in deploy-bot-callback',
        stage: 'unhandled_exception',
        details: msg.slice(0, 500),
      },
      500,
    )
  }
})
