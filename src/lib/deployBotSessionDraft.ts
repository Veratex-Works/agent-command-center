const PREFIX = 'openclaw:deployBotDraft:v1:'

export type DeployBotSessionDraft = {
  customerLabel: string
  env: Record<string, string>
  editingId: string | null
}

export function deployBotDraftStorageKey(userId: string) {
  return `${PREFIX}${userId}`
}

export function clearDeployBotSessionDraft(userId: string) {
  try {
    sessionStorage.removeItem(deployBotDraftStorageKey(userId))
  } catch {
    /* private mode / quota */
  }
}

export function readDeployBotSessionDraft(userId: string): DeployBotSessionDraft | null {
  try {
    const raw = sessionStorage.getItem(deployBotDraftStorageKey(userId))
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<DeployBotSessionDraft>
    if (typeof p.customerLabel !== 'string') return null
    if (typeof p.env !== 'object' || p.env === null) return null
    return {
      customerLabel: p.customerLabel,
      env: p.env as Record<string, string>,
      editingId: typeof p.editingId === 'string' ? p.editingId : null,
    }
  } catch {
    return null
  }
}

export function writeDeployBotSessionDraft(userId: string, draft: DeployBotSessionDraft) {
  try {
    sessionStorage.setItem(deployBotDraftStorageKey(userId), JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}
