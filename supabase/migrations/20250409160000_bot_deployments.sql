-- bot_deployments: per-bot env payload, superadmin-managed; optional 1:1 link to a client profile.
-- RLS: superadmin full CRUD; assigned client may SELECT their own row (gateway URL/token pre-fill).

-- ---------------------------------------------------------------------------
-- bot_deployments
-- ---------------------------------------------------------------------------
create table public.bot_deployments (
  id uuid primary key default gen_random_uuid(),
  customer_label text not null,
  status text not null default 'draft'
    check (status in ('draft', 'deploying', 'live', 'failed')),
  assigned_user_id uuid unique references public.profiles (id) on delete set null,
  deployment_env jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bot_deployments_status_idx on public.bot_deployments (status);
create index bot_deployments_customer_label_idx on public.bot_deployments (customer_label);

create or replace function public.set_bot_deployments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bot_deployments_set_updated_at
  before update on public.bot_deployments
  for each row
  execute procedure public.set_bot_deployments_updated_at();

alter table public.bot_deployments enable row level security;

create policy "bot_deployments_select_superadmin_or_assigned"
  on public.bot_deployments for select
  using (
    public.is_superadmin()
    or assigned_user_id = auth.uid()
  );

create policy "bot_deployments_insert_superadmin"
  on public.bot_deployments for insert
  with check (public.is_superadmin());

create policy "bot_deployments_update_superadmin"
  on public.bot_deployments for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "bot_deployments_delete_superadmin"
  on public.bot_deployments for delete
  using (public.is_superadmin());
