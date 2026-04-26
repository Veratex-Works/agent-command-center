-- Fix: RLS policies that subquery public.profiles from within profiles policies
-- caused PostgreSQL error 42P17 "infinite recursion detected in policy for relation profiles".
-- SECURITY DEFINER helper reads profiles with definer rights (bypasses RLS), breaking the cycle.

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'superadmin'
  );
$$;

grant execute on function public.is_superadmin() to public;

drop policy if exists "profiles_select_superadmin_all" on public.profiles;

create policy "profiles_select_superadmin_all"
  on public.profiles for select
  using (public.is_superadmin());

drop policy if exists "chat_logs_select_superadmin_all" on public.chat_logs;

create policy "chat_logs_select_superadmin_all"
  on public.chat_logs for select
  using (public.is_superadmin());
