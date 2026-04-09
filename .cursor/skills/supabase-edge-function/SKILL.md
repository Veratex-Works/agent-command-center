---
name: supabase-edge-function
description: >-
  Add or change a Supabase Edge Function in supabase/functions (Deno): CORS,
  _shared auth, validation, JSON errors, env secrets. Use when creating
  endpoints, webhooks, or AI pipeline functions next to existing functions.
---

# Supabase Edge Function playbook

## Before coding

1. Open a **similar existing function** in `supabase/functions/<name>/index.ts` and mirror its structure.
2. Confirm whether the caller is **browser** (needs CORS + user JWT) or **server/cron** (service role only).

## Implementation checklist

1. **CORS**: At the top of the handler, `handleCors(req)` from `_shared/cors.ts`; return early for `OPTIONS`.
2. **Auth**: Use `requireAuth`, `requireTeacher`, `requireStudent`, or `requireProvider` from `_shared/auth.ts` as appropriate. Do not duplicate Bearer parsing.
3. **Supabase client**: Use patterns from `auth.ts` (`getServiceClient` / `requireAuth` context) — no new global clients with hard-coded keys.
4. **Input**: Validate JSON body and search params; return **400** with `{ error: string }` and **CORS_HEADERS**.
5. **Secrets**: `Deno.env.get(...)` only; never log tokens or service keys.
6. **Single purpose**: One HTTP resource per function folder; extract shared logic into `_shared/`.

## After coding

- Ensure response **Content-Type** and status codes match sibling functions.
- If the function is new, document required **env vars** in `supabase/functions/.env.example` when adding new names.
