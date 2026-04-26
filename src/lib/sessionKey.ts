/** Gateway session lane id for webchat; includes auth user id when logged in. */
export function getDefaultSessionKeyForUser(userId: string): string {
  return `agent:main:webchat:direct:${userId}`
}

/**
 * `?session=foo` → `agent:main:webchat:direct:foo`.
 * If the value already looks like a full session key (contains `:`), use it as-is.
 */
export function sessionKeyFromSessionQueryParam(raw: string | null): string | null {
  const s = raw?.trim()
  if (!s) return null
  if (s.includes(':')) return s
  return `agent:main:webchat:direct:${s}`
}
