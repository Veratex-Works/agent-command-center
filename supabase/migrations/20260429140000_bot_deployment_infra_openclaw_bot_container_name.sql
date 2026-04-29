-- Record OpenClaw gateway Docker container name from the deploy pipeline (e.g. n8n → deploy-bot-callback) for NPM / ops UI.

alter table public.bot_deployment_infra
  add column if not exists openclaw_bot_container_name text;

comment on column public.bot_deployment_infra.openclaw_bot_container_name is
  'Full Docker container_name of the openclaw gateway service, set by deploy pipeline after stack is up (NPM upstream hostname).';
