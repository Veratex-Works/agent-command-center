import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0?target=deno'
import { corsJson, handleCors } from '../_shared/cors.ts'

type Body = {
  secret?: string
  botDeploymentId?: string
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

    const expected = env('N8N_COMPOSE_FETCH_SECRET')
    if (!expected) {
      return corsJson(
        { error: 'N8N_COMPOSE_FETCH_SECRET is not configured', stage: 'misconfigured' },
        500,
      )
    }

    let body: Body
    try {
      body = (await req.json()) as Body
    } catch {
      return corsJson({ error: 'Invalid JSON', stage: 'invalid_json' }, 400)
    }

    const got = body.secret?.trim() ?? ''
    if (!got || got !== expected) {
      return corsJson({ error: 'Forbidden', stage: 'forbidden' }, 403)
    }

    const id = body.botDeploymentId?.trim()
    if (!id) {
      return corsJson({ error: 'botDeploymentId is required', stage: 'validation' }, 400)
    }

    const url = env('SUPABASE_URL')
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) {
      return corsJson({ error: 'Server misconfigured', stage: 'edge_env_missing' }, 500)
    }

    const client = createClient(url, serviceKey)

    const { data: deployment, error: depErr } = await client
      .from('bot_deployments')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (depErr) {
      return corsJson({ error: 'Database error', stage: 'db_error' }, 500)
    }
    if (!deployment) {
      return corsJson({ error: 'Deployment not found', stage: 'not_found' }, 404)
    }

    const { data: composeRow, error: cyErr } = await client
      .from('deploy_compose_template')
      .select('compose_yaml')
      .eq('id', 1)
      .maybeSingle()

    if (cyErr) {
      return corsJson({ error: 'Database error', stage: 'db_error' }, 500)
    }

    const rawCompose = composeRow?.compose_yaml?.trim() ?? ''
    if (!rawCompose) {
      return corsJson(
        {
          error: 'Stack template is empty; save it under Deploy bot → Stack template.',
          stage: 'empty_compose',
        },
        404,
      )
    }

    const idSafe = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 36)
    const composeYaml = rawCompose.replace(/REPLACE_WITH_UNIQUE_NAME/g, idSafe)

    return corsJson({ composeYaml })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return corsJson(
      {
        error: 'Unhandled error in deploy-webhook-compose',
        stage: 'unhandled_exception',
        details: msg.slice(0, 500),
      },
      500,
    )
  }
})
