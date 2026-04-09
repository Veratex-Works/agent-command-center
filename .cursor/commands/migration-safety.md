# Migration safety review

For the SQL migration(s) in scope under `supabase/migrations/`:

- Is the migration **additive** and safe for existing production data?
- Are **RLS** policies correct for all roles after the change? Any accidental broadening?
- Are **POPIA / personal data** tables affected? If so, alignment with consent, export, and deletion flows.
- **Idempotency**: safe to re-run or apply on partially migrated DBs where relevant?
- **Rollback story**: what breaks if we revert code without reverting DB?

Give a short **ship / fix-first / hold** recommendation with reasons.
