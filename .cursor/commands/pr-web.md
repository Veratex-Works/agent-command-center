# PR checklist — `web/`

For the current change set under `web/`:

- **Architecture**: UI vs data split; no raw Supabase in large presentational components if a hook exists or should exist.
- **React Query**: Query keys are specific enough; mutations invalidate the right keys; loading/error/empty states handled.
- **Routing**: React Router v6 usage matches `App.tsx` patterns; lazy routes if appropriate.
- **Forms**: RHF + Zod where there is a form; accessible labels and errors.
- **UI**: Tailwind/shadcn consistency; no inline styles unless already standard in file.
- **Types**: No unnecessary `any`; props/interfaces are minimal (ISP).

List **must-fix** vs **optional** items only.
