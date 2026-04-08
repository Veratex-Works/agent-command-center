import type { Config } from '@/types'

const STORAGE_KEY = 'openclaw_config'

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const c = raw ? (JSON.parse(raw) as Partial<Config>) : {}
    return {
      url: c.url ?? '',
      token: c.token ?? '',
      sessionKey: c.sessionKey ?? '',
    }
  } catch {
    return { url: '', token: '', sessionKey: '' }
  }
}

export function saveConfig(config: Config): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ url: config.url, token: config.token, sessionKey: config.sessionKey }),
  )
}

export function getDeviceTokenKey(gatewayUrl: string): string {
  return `openclaw_device_token_${gatewayUrl}`
}

export function saveDeviceToken(gatewayUrl: string, token: string): void {
  localStorage.setItem(getDeviceTokenKey(gatewayUrl), token)
}
