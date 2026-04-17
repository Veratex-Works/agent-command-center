import { corsJson, handleCors } from '../_shared/cors.ts'
import { requireSuperadmin } from '../_shared/auth.ts'

type PostBody = {
  botDeploymentId?: string
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

    let body: PostBody
    try {
      body = (await req.json()) as PostBody
    } catch {
      return corsJson({ error: 'Invalid JSON', stage: 'invalid_json' }, 400)
    }

    const id = body.botDeploymentId?.trim()
    if (!id) {
      return corsJson({ error: 'botDeploymentId is required', stage: 'validation' }, 400)
    }

    const { data: row, error } = await auth.serviceClient
      .from('bot_deployments')
      .select('id, customer_label')
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
      .select('agent_base_url')
      .eq('bot_deployment_id', id)
      .maybeSingle()

    const agentBaseUrl = infraRow?.agent_base_url?.trim() ?? ''
    if (!agentBaseUrl) {
      return corsJson(
        {
          error:
            'agent_base_url is not set for this deployment. Set bot_deployment_infra.agent_base_url (deploy agent HTTPS URL) after provision.',
          stage: 'validation',
        },
        400,
      )
    }
    const agentLower = agentBaseUrl.toLowerCase()
    if (
      agentLower.includes('developers.hostinger.com') ||
      agentLower.includes('/virtual-machines') ||
      agentLower.includes('hostinger.com/api')
    ) {
      return corsJson(
        {
          error:
            'bot_deployment_infra.agent_base_url must be your self-hosted deploy-agent origin (e.g. https://deploy.example.com), not the Hostinger VPS API URL. Fix the row in Supabase, then retry Post-deploy.',
          stage: 'validation',
        },
        400,
      )
    }

    const { data: providerRow } = await auth.serviceClient
      .from('deploy_provider_settings')
      .select('stack_agent_bearer_token')
      .eq('id', 1)
      .maybeSingle()

    const stackAgentBearerToken = providerRow?.stack_agent_bearer_token?.trim() ?? ''

    const hook = Deno.env.get('N8N_POST_DEPLOY_WEBHOOK_URL')?.trim()
    if (!hook) {
      return corsJson(
        {
          error:
            'N8N_POST_DEPLOY_WEBHOOK_URL is not set on this Edge runtime. In Supabase Dashboard → Edge Functions → Secrets, add it, then redeploy deploy-post-openclaw (secrets are baked at deploy).',
          stage: 'misconfigured',
        },
        500,
      )
    }

    let n8nRes: Response
    try {
      n8nRes = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botDeploymentId: row.id,
          customerLabel: row.customer_label,
          agentBaseUrl,
          stackAgent: {
            bearerToken: stackAgentBearerToken ? stackAgentBearerToken : null,
          },
        }),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return corsJson(
        {
          error: 'Could not open a connection to the n8n post-deploy webhook URL.',
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
          error: 'n8n post-deploy webhook failed',
          stage: 'n8n_webhook_failed',
          status: n8nRes.status,
          details: text.slice(0, 500),
        },
        502,
      )
    }

    return corsJson({ ok: true, stage: 'n8n_ok' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return corsJson(
      {
        error: 'Unhandled error in deploy-post-openclaw',
        stage: 'unhandled_exception',
        details: msg.slice(0, 500),
      },
      500,
    )
  }
})
