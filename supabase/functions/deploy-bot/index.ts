import { corsJson, handleCors } from '../_shared/cors.ts'
import { requireSuperadmin } from '../_shared/auth.ts'

type DeployBody = {
  botDeploymentId?: string
  test?: boolean
  /** When true, n8n should redeploy the stack on the existing host only (no new VPS). */
  updateStackOnly?: boolean
}

function isTlsOrCertFailure(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('unknownissuer') ||
    m.includes('invalid peer certificate') ||
    m.includes('certificate') && m.includes('verify') ||
    m.includes('cert_verify') ||
    m.includes('ssl error') ||
    m.includes('tls handshake')
  )
}

/**
 * n8n builds Hostinger `project_name` as `openclaw-${slug}__${botDeploymentId}` (see docs/n8n/deploy-bot-workflow.json).
 * Two full UUID segments exceed Hostinger's 64-character limit. Send a short token for slugging only; the row still
 * stores the full `assigned_user_id`. Uniqueness remains from `botDeploymentId` in the same string.
 */
function assigneeKeyForN8nSlugging(fullUserId: string | null): string | null {
  if (fullUserId == null) return null
  const t = fullUserId.trim()
  if (!t) return null
  const hex = t.replace(/-/g, '').toLowerCase().replace(/[^a-f0-9]/g, '')
  if (hex.length >= 8) return hex.slice(0, 8)
  return t.length <= 8 ? t : t.slice(0, 8)
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'POST') {
      return corsJson({ error: 'Method not allowed', stage: 'method_not_allowed' }, 405)
    }

    const auth = await requireSuperadmin(req)
    if (!auth.ok) return auth.response

    let body: DeployBody
    try {
      body = (await req.json()) as DeployBody
    } catch {
      return corsJson({ error: 'Invalid JSON', stage: 'invalid_json' }, 400)
    }

    const id = body.botDeploymentId?.trim()
    if (!id) {
      return corsJson({ error: 'botDeploymentId is required', stage: 'validation' }, 400)
    }

    const isTest = body.test === true
    const updateStackOnly = body.updateStackOnly === true

    const { data: row, error } = await auth.serviceClient
      .from('bot_deployments')
      .select('id, customer_label, deployment_env, assigned_user_id')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return corsJson({ error: 'Database error', stage: 'db_error' }, 500)
    }
    if (!row) {
      return corsJson({ error: 'Deployment not found', stage: 'not_found' }, 404)
    }

    const { data: infraRow } = await auth.serviceClient
      .from('bot_deployment_infra')
      .select(
        'provider_vm_id, vps_public_ipv4, agent_base_url, last_deployed_at, last_provisioned_at',
      )
      .eq('bot_deployment_id', id)
      .maybeSingle()

    const { data: providerRow } = await auth.serviceClient
      .from('deploy_provider_settings')
      .select('vps_api_base_url, vps_api_token, stack_agent_bearer_token')
      .eq('id', 1)
      .maybeSingle()

    const { data: composeRow } = await auth.serviceClient
      .from('deploy_compose_template')
      .select('compose_yaml')
      .eq('id', 1)
      .maybeSingle()

    const vpsApiBaseUrl = providerRow?.vps_api_base_url?.trim() ?? ''
    const vpsApiToken = providerRow?.vps_api_token?.trim() ?? ''
    const stackAgentBearerToken = providerRow?.stack_agent_bearer_token?.trim() ?? ''
    const composeYaml = composeRow?.compose_yaml?.trim() ?? ''

    const hasHostingerVm = Boolean(infraRow?.provider_vm_id?.trim())

    if (updateStackOnly && !hasHostingerVm) {
      return corsJson(
        {
          error:
            'updateStackOnly requires provider_vm_id (Hostinger virtual machine id) on this deployment. Set it in bot_deployment_infra or via deploy-bot-callback after provision.',
          stage: 'validation',
        },
        400,
      )
    }

    if (!updateStackOnly && !vpsApiBaseUrl) {
      return corsJson(
        {
          error:
            'VPS provider API base URL is not set. Save it under Deploy bot → Provider API (stored in deploy_provider_settings).',
          stage: 'validation',
        },
        400,
      )
    }

    if (!composeYaml) {
      return corsJson(
        {
          error:
            'Docker Compose template is empty. Save the stack template under Deploy bot → Stack template (deploy_compose_template).',
          stage: 'validation',
        },
        400,
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
    if (!supabaseUrl) {
      return corsJson(
        { error: 'SUPABASE_URL is not configured on the Edge runtime', stage: 'misconfigured' },
        500,
      )
    }

    const prodHook = Deno.env.get('N8N_DEPLOY_WEBHOOK_URL')?.trim()
    const testHook = Deno.env.get('N8N_DEPLOY_WEBHOOK_TEST_URL')?.trim()
    const hook = isTest ? testHook : prodHook

    if (isTest && !testHook) {
      return corsJson(
        { error: 'N8N_DEPLOY_WEBHOOK_TEST_URL is not configured', stage: 'misconfigured' },
        500,
      )
    }
    if (!isTest && !prodHook) {
      return corsJson(
        { error: 'N8N_DEPLOY_WEBHOOK_URL is not configured', stage: 'misconfigured' },
        500,
      )
    }

    let n8nRes: Response
    try {
      /** Stack YAML is loaded by n8n via POST deploy-webhook-compose (small webhook body). */
      const composeFetchUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/deploy-webhook-compose`

      const n8nPayload = {
        botDeploymentId: row.id,
        customerLabel: row.customer_label,
        assignedUserId: assigneeKeyForN8nSlugging(row.assigned_user_id ?? null),
        composeFetchUrl,
        env: row.deployment_env ?? {},
        updateStackOnly,
        stackAgent: {
          bearerToken: stackAgentBearerToken ? stackAgentBearerToken : null,
        },
        provider: {
          vpsApiBaseUrl: vpsApiBaseUrl || null,
          vpsApiToken: vpsApiToken || null,
        },
        infra: {
          providerVmId: infraRow?.provider_vm_id ?? null,
          vpsPublicIpv4: infraRow?.vps_public_ipv4 ?? null,
          agentBaseUrl: infraRow?.agent_base_url ?? null,
          lastDeployedAt: infraRow?.last_deployed_at ?? null,
          lastProvisionedAt: infraRow?.last_provisioned_at ?? null,
        },
      }
      n8nRes = await fetch(hook!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nPayload),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isTlsOrCertFailure(msg)) {
        return corsJson(
          {
            error:
              'n8n URL uses a TLS certificate the Edge runtime does not trust (e.g. self-signed or incomplete chain). Use a publicly trusted certificate (e.g. Let\'s Encrypt) and serve the full chain.',
            stage: 'n8n_tls_error',
            details: msg.slice(0, 500),
          },
          502,
        )
      }
      return corsJson(
        {
          error: 'Could not open a connection to the n8n webhook URL.',
          stage: 'n8n_unreachable',
          details: msg.slice(0, 500),
        },
        502,
      )
    }

    if (!n8nRes.ok) {
      const text = await n8nRes.text()
      return corsJson(
        {
          error: 'n8n webhook failed',
          stage: 'n8n_webhook_failed',
          status: n8nRes.status,
          details: text.slice(0, 500),
        },
        502,
      )
    }

    return corsJson({
      ok: true,
      stage: isTest ? 'n8n_test_ok' : 'n8n_ok',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return corsJson(
      {
        error: 'Unhandled error in deploy-bot',
        stage: 'unhandled_exception',
        details: msg.slice(0, 500),
      },
      500,
    )
  }
})
