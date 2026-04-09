# Review Supabase Edge Function

Review the Edge Function in scope as a security and consistency pass.

- Confirm `handleCors` runs first and OPTIONS returns correctly.
- Confirm auth uses `_shared/auth.ts` helpers; no duplicate JWT logic.
- Check input validation and error JSON shape; status codes (401/403/400/500) are appropriate.
- Ensure no secrets logged; env vars only via `Deno.env`.
- Compare JSON request/response shapes with callers and sibling functions.
- Note any RLS or service-role implications for DB calls.

Summarize findings as: **blockers**, **should-fix**, **nice-to-have**.
