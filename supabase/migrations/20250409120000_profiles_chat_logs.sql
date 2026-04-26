-- Profiles (app users + roles) and chat_logs (WebSocket traffic).
-- Apply via Supabase CLI or SQL editor. Promote first superadmin manually:
--   update public.profiles set role = 'superadmin' where id = '<user-uuid>';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'superadmin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute procedure public.set_profiles_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_select_superadmin_all"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'superadmin'
    )
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- chat_logs
-- ---------------------------------------------------------------------------
create table public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_key text,
  direction text not null check (direction in ('in', 'out')),
  data jsonb not null,
  logged_at timestamptz not null
);

create index chat_logs_user_logged_at_idx
  on public.chat_logs (user_id, logged_at desc);

alter table public.chat_logs enable row level security;

create policy "chat_logs_insert_own"
  on public.chat_logs for insert
  with check (user_id = auth.uid());

create policy "chat_logs_select_own"
  on public.chat_logs for select
  using (user_id = auth.uid());

create policy "chat_logs_select_superadmin_all"
  on public.chat_logs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'superadmin'
    )
  );
