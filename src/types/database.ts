export type UserRole = 'user' | 'superadmin'

export interface Profile {
  id: string
  email: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface ChatLogRowInsert {
  user_id: string
  session_key: string | null
  direction: 'in' | 'out'
  data: unknown
  logged_at: string
}

export type BotDeploymentStatus = 'draft' | 'deploying' | 'live' | 'failed'

/** Keys stored in bot_deployments.deployment_env (normalized OPENCLAW_GATEWAY_REMOTE_TOKEN). */
export const DEPLOYMENT_ENV_KEYS = [
  'OPENCLAW_GATEWAY_URL',
  // Set on deploy (n8n) from OPENCLAW_GATEWAY_URL for openclaw-workspace-init; optional manual override in DB.
  'OPENCLAW_CONTROL_UI_ORIGIN',
  'OPENCLAW_GATEWAY_TOKEN',
  'OPENCLAW_DEFAULT_PROVIDER',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'AGENT_MODEL',
  'GATEWAY_AGENT_MODEL',
  'OPENCLAW_AGENT_MODEL',
  'OPENCLAW_GATEWAY_REMOTE_TOKEN',
  'OPENCLAW_GATEWAY_PORT',
  /** Comma-separated proxy IPs for openclaw.json gateway.trustedProxies (e.g. NPM on bot-bridge). */
  'OPENCLAW_GATEWAY_TRUSTED_PROXIES',
  /**
   * Docker image ref for compose service `openclaw-post-deploy-hook` (${OPENCLAW_STACK_HOOK_IMAGE}).
   * Required for Hostinger / n8n deploy when DEFAULT_OPENCLAW_STACK_HOOK_IMAGE is not set on deploy-bot Edge.
   */
  'OPENCLAW_STACK_HOOK_IMAGE',
  /**
   * Post-deploy hook listen port (packages/openclaw-stack-hook `STACK_HOOK_PORT`).
   * Set a unique value per bot on the same VPS; compose maps host:container to this port. Omit for default 18790.
   */
  'STACK_HOOK_PORT',
] as const

export type DeploymentEnvKey = (typeof DEPLOYMENT_ENV_KEYS)[number]

export type DeploymentEnv = Partial<Record<DeploymentEnvKey, string>>

/** Optional short labels for the Deploy bot form (fallback: raw env key). */
export const DEPLOYMENT_ENV_LABELS: Partial<Record<DeploymentEnvKey, string>> = {
  OPENCLAW_GATEWAY_PORT: 'OpenClaw gateway port',
  OPENCLAW_STACK_HOOK_IMAGE: 'Stack hook Docker image',
  STACK_HOOK_PORT: 'Stack hook port',
}

/** Optional one-line help under the field label. */
export const DEPLOYMENT_ENV_HELP: Partial<Record<DeploymentEnvKey, string>> = {
  OPENCLAW_GATEWAY_PORT:
    'Port the OpenClaw gateway listens on in the stack (default 18789). Set a unique value per deployment on one VPS; point NPM WebSocket upstream at this port on the bot container.',
  OPENCLAW_STACK_HOOK_IMAGE:
    'Full image reference (e.g. ghcr.io/your-org/openclaw-stack-hook:1.0.0). Written to the VPS .env so compose can pull the hook container.',
  STACK_HOOK_PORT:
    'TCP port for the merge hook (default 18790). Use a different port per deployment when several bots share one VPS; point NPM agent_base_url at that host port.',
}

export interface BotDeployment {
  id: string
  customer_label: string
  status: BotDeploymentStatus
  assigned_user_id: string | null
  deployment_env: DeploymentEnv
  /** Optional OpenClaw config merged before compose (n8n encodes as OPENCLAW_BASE_JSON_B64 in deploy .env). */
  openclaw_base_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/** Singleton row id=1; VPS provider API root (Hostinger, etc.). Edited on Deploy bot page. */
export interface DeployProviderSettings {
  id: number
  vps_api_base_url: string | null
  vps_api_token: string | null
  /** Bearer token n8n sends to the VPS stack deploy agent (POST /deploy), not Hostinger. */
  stack_agent_bearer_token: string | null
  updated_at: string
}

/** Singleton row id=1; global docker-compose template for the deploy agent. */
export interface DeployComposeTemplate {
  id: number
  compose_yaml: string
  updated_at: string
}

/** One row per bot_deployments; infra is separate from deployment_env secrets. */
export interface BotDeploymentInfra {
  bot_deployment_id: string
  provider_vm_id: string | null
  vps_public_ipv4: string | null
  agent_base_url: string | null
  /** Set by deploy pipeline (e.g. deploy-bot-callback) for NPM upstream hostname. */
  openclaw_bot_container_name: string | null
  last_deployed_at: string | null
  last_provisioned_at: string | null
  updated_at: string
}
