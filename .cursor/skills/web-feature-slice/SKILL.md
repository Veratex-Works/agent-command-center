---
name: web-feature-slice
description: >-
  Add a feature slice in web/ — modules layout, TanStack Query, hooks vs UI,
  Supabase access. Use for teacher/student UI in the lucem-web app.
---

# `web/` feature slice playbook

## Placement

- Feature code lives under `web/src/modules/<domain>/` with **components/**, **hooks/**, **pages/**, **lib/** as needed.
- Shared cross-feature UI in `web/src/modules/common/` (do not copy-paste primitives).

## Data and state

- **Server state**: TanStack Query in dedicated hooks or `lib` query modules; **stable query keys**; handle loading, error, and empty UI.
- **Supabase**: Keep calls in hooks or small `lib` functions — **not** inline in large presentational components (aligns with SOLID rule).
- **UI-only state**: Zustand only when not server-backed.

## Routing

- React Router **v6**: register routes in `web/src/App.tsx` (or the established router module); use lazy-loaded pages where the app already does.

## Forms

- **React Hook Form + Zod** for forms; colocate schema with the form or feature `lib`.

## Quality

- Match existing **Tailwind + shadcn** patterns; use `@/` imports.
- Co-locate tests next to components (`*.test.tsx`) when adding tests.
