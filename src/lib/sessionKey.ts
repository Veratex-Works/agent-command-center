/** Gateway session lane id for webchat; includes auth user id when logged in. */
export function getDefaultSessionKeyForUser(userId: string): string {
  return `agent:main:webchat:direct:${userId}`
}
