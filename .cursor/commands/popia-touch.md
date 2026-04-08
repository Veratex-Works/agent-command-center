# POPIA / privacy touch review

The change touches consent, account deletion, data export, or personal identifiable fields.

- Map affected **tables**, **Edge Functions**, and **UI** (web vs admin).
- Verify consistency with existing **POPIA migrations** and `_shared/consent.ts` (and related helpers).
- Check user-facing **copy** and **audit trail** expectations if the app logs or stores consent events.
- Ensure **retention** and **deletion** paths remain coherent (no orphaned PII).

Output **compliance risks** (if any) and **concrete code/SQL** follow-ups.
