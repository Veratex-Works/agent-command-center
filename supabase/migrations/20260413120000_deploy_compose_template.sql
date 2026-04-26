-- Global docker-compose template for stack deploy agent (superadmin-editable).
-- stack_agent_bearer_token: shared secret forwarded to n8n for Authorization on POST /deploy only.

-- ---------------------------------------------------------------------------
-- deploy_compose_template (singleton id = 1)
-- ---------------------------------------------------------------------------
create table public.deploy_compose_template (
  id smallint primary key default 1,
  compose_yaml text not null,
  updated_at timestamptz not null default now(),
  constraint deploy_compose_template_singleton check (id = 1)
);

create or replace function public.set_deploy_compose_template_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger deploy_compose_template_set_updated_at
  before update on public.deploy_compose_template
  for each row
  execute procedure public.set_deploy_compose_template_updated_at();

insert into public.deploy_compose_template (id, compose_yaml) values (1, $compose$
services:
  nginx-proxy:
    image: 'jc21/nginx-proxy-manager:latest'
    container_name: nginx-proxy
    restart: always
    ports:
      - 80:80
      - 81:81
      - 443:443
    volumes:
      - ./nginx_data:/data
      - ./letsencrypt:/etc/letsencrypt
    networks:
      - bot-bridge

  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: openclaw_bot
    restart: unless-stopped
    networks:
      - bot-bridge
    env_file:
      - .env
    volumes:
      - openclaw_data:/home/node/.openclaw
    environment:
      - OPENCLAW_GATEWAY_BIND=0.0.0.0
      - OPENCLAW_GATEWAY_PORT=18789
      - OPENCLAW_GATEWAY_MODE=remote
      - OPENCLAW_GATEWAY_AUTH_MODE=token
      - OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1

volumes:
  openclaw_data:

networks:
  bot-bridge:
    external: true
$compose$)
  on conflict (id) do nothing;

alter table public.deploy_compose_template enable row level security;

create policy "deploy_compose_template_select_superadmin"
  on public.deploy_compose_template for select
  using (public.is_superadmin());

create policy "deploy_compose_template_update_superadmin"
  on public.deploy_compose_template for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "deploy_compose_template_insert_superadmin"
  on public.deploy_compose_template for insert
  with check (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- deploy_provider_settings: stack agent bearer (n8n -> VPS agent only)
-- ---------------------------------------------------------------------------
alter table public.deploy_provider_settings
  add column if not exists stack_agent_bearer_token text;
