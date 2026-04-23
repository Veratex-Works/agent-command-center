import { corsJson, handleCors } from '../_shared/cors.ts'
import { requireSuperadmin } from '../_shared/auth.ts'

type Body = {
  userId?: string
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

    const { serviceClient, callerId } = auth

    let body: Body
    try {
      body = (await req.json()) as Body
    } catch {
      return corsJson({ error: 'Invalid JSON', stage: 'invalid_json' }, 400)
    }

    const userId = body.userId?.trim()
    if (!userId) {
      return corsJson({ error: 'userId is required', stage: 'validation' }, 400)
    }

    if (userId === callerId) {
      return corsJson(
        { error: 'You cannot delete your own account from here.', stage: 'validation' },
        400,
      )
    }

    const { data: target, error: te } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (te) {
      return corsJson({ error: te.message, stage: 'db_error' }, 500)
    }
    if (!target) {
      return corsJson({ error: 'User not found', stage: 'not_found' }, 404)
    }

    if (target.role === 'superadmin') {
      const { count, error: ce } = await serviceClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'superadmin')

      if (ce) {
        return corsJson({ error: ce.message, stage: 'db_error' }, 500)
      }
      if ((count ?? 0) <= 1) {
        return corsJson(
          { error: 'Cannot delete the last superadmin.', stage: 'validation' },
          400,
        )
      }
    }

    const { error: delErr } = await serviceClient.auth.admin.deleteUser(userId)
    if (delErr) {
      return corsJson(
        { error: delErr.message, stage: 'auth_admin_delete', details: delErr.name },
        400,
      )
    }

    return corsJson({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return corsJson({ error: msg, stage: 'unexpected' }, 500)
  }
})
