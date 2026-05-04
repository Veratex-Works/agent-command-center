/** localStorage flag: show full assistant/history payloads instead of normalized chat text. */
export const DEBUG_RAW_ASSISTANT_KEY = 'openclaw_debug_raw_assistant'

export function getDebugRawAssistant(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DEBUG_RAW_ASSISTANT_KEY) === '1'
}

export function setDebugRawAssistant(enabled: boolean): void {
  if (typeof window === 'undefined') return
  if (enabled) window.localStorage.setItem(DEBUG_RAW_ASSISTANT_KEY, '1')
  else window.localStorage.removeItem(DEBUG_RAW_ASSISTANT_KEY)
}

const MAX = 200_000

export function safeStringify(value: unknown, maxChars = MAX): string {
  try {
    const s = JSON.stringify(value, null, 2)
    if (s.length <= maxChars) return s
    return `${s.slice(0, maxChars)}\n\n… [truncated ${s.length - maxChars} chars]`
  } catch {
    return String(value)
  }
}
