---
name: supabase-rls-migration
description: >-
  Add or revise Postgres migrations with RLS, policies, and POPIA-sensitive
  data. Use when editing supabase/migrations SQL or security around personal
  data.
---

# Supabase RLS / migration playbook

## Conventions

1. **New file**: `supabase/migrations/YYYYMMDDHHMMSS_short_description.sql` after the latest migration timestamp.
2. **Header**: Include a short commented block describing intent and any rollout notes.
3. **RLS**: For new tables, enable RLS and add explicit policies; follow existing role patterns (teacher, student, provider, service).
4. **Idempotency**: Prefer `DROP POLICY IF EXISTS` before `CREATE POLICY` when replacing policies; use `IF NOT EXISTS` for objects where safe.

## Personal / compliance data

- Cross-check **POPIA-related** tables, consent flags, export, and deletion flows before adding columns that store identifiers or preferences.
- Avoid duplicating PII across tables without a documented reason and cleanup path.

## Verification

- Reason through **SELECT/INSERT/UPDATE/DELETE** for each role after policy changes.
- Keep destructive changes (**DROP COLUMN**, data deletes) behind explicit product approval.
