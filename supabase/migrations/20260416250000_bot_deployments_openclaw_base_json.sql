-- Optional full OpenClaw config object written before compose (n8n → .env OPENCLAW_BASE_JSON_B64; init decodes).

alter table public.bot_deployments
  add column if not exists openclaw_base_json jsonb;

comment on column public.bot_deployments.openclaw_base_json is
  'Optional OpenClaw JSON object merged before workspace-init; also sent as OPENCLAW_BASE_JSON_B64 in deploy .env.';
