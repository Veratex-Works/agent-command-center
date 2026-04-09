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
  'OPENCLAW_GATEWAY_TOKEN',
  'OPENCLAW_DEFAULT_PROVIDER',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'AGENT_MODEL',
  'GATEWAY_AGENT_MODEL',
  'OPENCLAW_AGENT_MODEL',
  'OPENCLAW_GATEWAY_REMOTE_TOKEN',
  'OPENCLAW_GATEWAY_PORT',
] as const

export type DeploymentEnvKey = (typeof DEPLOYMENT_ENV_KEYS)[number]

export type DeploymentEnv = Partial<Record<DeploymentEnvKey, string>>

export interface BotDeployment {
  id: string
  customer_label: string
  status: BotDeploymentStatus
  assigned_user_id: string | null
  deployment_env: DeploymentEnv
  created_at: string
  updated_at: string
}
