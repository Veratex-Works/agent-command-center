import { corsJson, handleCors } from '../_shared/cors.ts'
import { requireSuperadmin } from '../_shared/auth.ts'

type DeployBody = {
  botDeploymentId?: string
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return corsJson({ error: 'Method not allowed' }, 405)
  }

  const auth = await requireSuperadmin(req)
  if (!auth.ok) return auth.response

  let body: DeployBody
  try {
    body = (await req.json()) as DeployBody
  } catch {
    return corsJson({ error: 'Invalid JSON' }, 400)
  }

  const id = body.botDeploymentId?.trim()
  if (!id) {
    return corsJson({ error: 'botDeploymentId is required' }, 400)
  }

  const { data: row, error } = await auth.serviceClient
    .from('bot_deployments')
    .select('id, customer_label, deployment_env')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return corsJson({ error: 'Database error' }, 500)
  }
  if (!row) {
    return corsJson({ error: 'Deployment not found' }, 404)
  }

  const hook = Deno.env.get('N8N_DEPLOY_WEBHOOK_URL')?.trim()
  if (!hook) {
    return corsJson({ error: 'N8N_DEPLOY_WEBHOOK_URL is not configured' }, 500)
  }

  const n8nRes = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      botDeploymentId: row.id,
      customerLabel: row.customer_label,
      env: row.deployment_env ?? {},
    }),
  })

  if (!n8nRes.ok) {
    const text = await n8nRes.text()
    return corsJson(
      { error: 'n8n webhook failed', details: text.slice(0, 500) },
      502,
    )
  }

  return corsJson({ ok: true })
})
