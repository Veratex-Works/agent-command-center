-- Replace single "own row only" update policy so superadmins can update other users' rows
-- (e.g. promote/demote). Requires public.is_superadmin() from 20250409130000.
--
-- Table Editor: still often fails RLS because requests are not scoped as the target user.
-- Use SQL Editor (runs as superuser) for one-off promotions, or the app while logged in as superadmin.
-- Role must be exactly 'superadmin' or 'user' (lowercase) — CHECK constraint on public.profiles.role.

drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own_or_superadmin"
  on public.profiles for update
  using (auth.uid() = id or public.is_superadmin())
  with check (auth.uid() = id or public.is_superadmin());
