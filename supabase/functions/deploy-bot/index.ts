import { corsJson, handleCors } from '../_shared/cors.ts'
import { requireSuperadmin } from '../_shared/auth.ts'

type DeployBody = {
  botDeploymentId?: string
  test?: boolean
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

    const { data: row, error } = await auth.serviceClient
      .from('bot_deployments')
      .select('id, customer_label, deployment_env')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return corsJson({ error: 'Database error', stage: 'db_error' }, 500)
    }
    if (!row) {
      return corsJson({ error: 'Deployment not found', stage: 'not_found' }, 404)
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
      n8nRes = await fetch(hook!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botDeploymentId: row.id,
          customerLabel: row.customer_label,
          env: row.deployment_env ?? {},
        }),
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
