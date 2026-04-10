import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0?target=deno'
import { corsJson } from './cors.ts'

function env(name: string): string | null {
  const v = Deno.env.get(name)
  return v?.trim() ? v : null
}

export async function requireSuperadmin(req: Request): Promise<
  | { ok: true; serviceClient: SupabaseClient }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, response: corsJson({ error: 'Unauthorized' }, 401) }
  }
  const jwt = authHeader.slice('Bearer '.length).trim()
  if (!jwt) {
    return { ok: false, response: corsJson({ error: 'Unauthorized' }, 401) }
  }

  const url = env('SUPABASE_URL')
  const anon = env('SUPABASE_ANON_KEY')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !serviceKey) {
    return {
      ok: false,
      response: corsJson(
        { error: 'Server misconfigured', stage: 'edge_env_missing' },
        500,
      ),
    }
  }

  // Pass the JWT explicitly: getUser() without args uses the browser session path and
  // fails in Edge/Deno where there is no persisted session.
  const userClient = createClient(url, anon)
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(jwt)
  if (userErr || !user) {
    return { ok: false, response: corsJson({ error: 'Unauthorized' }, 401) }
  }

  const serviceClient = createClient(url, serviceKey)
  const { data: profile, error: pe } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (pe || !profile || profile.role !== 'superadmin') {
    return { ok: false, response: corsJson({ error: 'Forbidden' }, 403) }
  }

  return { ok: true, serviceClient }
}
