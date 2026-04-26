-- Global VPS provider API settings (superadmin UI) and per-deployment infrastructure
-- (VM id, IP, agent URL, deploy timestamps). Secrets stay in deployment_env; infra stays here.

-- ---------------------------------------------------------------------------
-- deploy_provider_settings (singleton row id = 1)
-- ---------------------------------------------------------------------------
create table public.deploy_provider_settings (
  id smallint primary key default 1,
  vps_api_base_url text,
  vps_api_token text,
  updated_at timestamptz not null default now(),
  constraint deploy_provider_settings_singleton check (id = 1)
);

create or replace function public.set_deploy_provider_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger deploy_provider_settings_set_updated_at
  before update on public.deploy_provider_settings
  for each row
  execute procedure public.set_deploy_provider_settings_updated_at();

insert into public.deploy_provider_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.deploy_provider_settings enable row level security;

create policy "deploy_provider_settings_select_superadmin"
  on public.deploy_provider_settings for select
  using (public.is_superadmin());

create policy "deploy_provider_settings_update_superadmin"
  on public.deploy_provider_settings for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- bot_deployment_infra (1:1 with bot_deployments)
-- ---------------------------------------------------------------------------
create table public.bot_deployment_infra (
  bot_deployment_id uuid primary key references public.bot_deployments (id) on delete cascade,
  provider_vm_id text,
  vps_public_ipv4 text,
  agent_base_url text,
  last_deployed_at timestamptz,
  last_provisioned_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.set_bot_deployment_infra_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bot_deployment_infra_set_updated_at
  before update on public.bot_deployment_infra
  for each row
  execute procedure public.set_bot_deployment_infra_updated_at();

insert into public.bot_deployment_infra (bot_deployment_id)
select id from public.bot_deployments
on conflict (bot_deployment_id) do nothing;

create or replace function public.ensure_bot_deployment_infra_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bot_deployment_infra (bot_deployment_id) values (new.id)
  on conflict (bot_deployment_id) do nothing;
  return new;
end;
$$;

create trigger bot_deployments_after_insert_ensure_infra
  after insert on public.bot_deployments
  for each row
  execute procedure public.ensure_bot_deployment_infra_row();

alter table public.bot_deployment_infra enable row level security;

create policy "bot_deployment_infra_select_superadmin_or_assigned"
  on public.bot_deployment_infra for select
  using (
    public.is_superadmin()
    or exists (
      select 1
      from public.bot_deployments b
      where b.id = bot_deployment_infra.bot_deployment_id
        and b.assigned_user_id = auth.uid()
    )
  );

create policy "bot_deployment_infra_update_superadmin"
  on public.bot_deployment_infra for update
  using (public.is_superadmin())
  with check (public.is_superadmin());
