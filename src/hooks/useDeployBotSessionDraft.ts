import { useEffect, useMemo, useRef, useState } from 'react'
import { readDeployBotSessionDraft, writeDeployBotSessionDraft } from '@/lib/deployBotSessionDraft'
import { DEPLOYMENT_ENV_KEYS, type DeploymentEnv } from '@/types/database'

function emptyEnv(): DeploymentEnv {
  return Object.fromEntries(DEPLOYMENT_ENV_KEYS.map((k) => [k, ''])) as DeploymentEnv
}

/**
 * Restores deploy form from sessionStorage on mount; debounced writes while editing.
 * Cleared on sign-out via {@link clearDeployBotSessionDraft} from AuthProvider.
 */
export function useDeployBotSessionDraft(
  userId: string | undefined,
  customerLabel: string,
  env: DeploymentEnv,
  editingId: string | null,
  setCustomerLabel: (v: string) => void,
  setEnv: (v: DeploymentEnv | ((prev: DeploymentEnv) => DeploymentEnv)) => void,
  setEditingId: (v: string | null) => void,
) {
  const [draftReady, setDraftReady] = useState(false)
  const lastUserIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    queueMicrotask(() => {
      if (!userId) {
        setDraftReady(false)
        lastUserIdRef.current = undefined
        return
      }

      if (lastUserIdRef.current !== userId) {
        lastUserIdRef.current = userId
        setDraftReady(false)
        const stored = readDeployBotSessionDraft(userId)
        if (stored) {
          setCustomerLabel(stored.customerLabel)
          const merged = emptyEnv()
          for (const k of DEPLOYMENT_ENV_KEYS) {
            const v = stored.env[k]
            if (typeof v === 'string') merged[k] = v
          }
          setEnv(merged)
          setEditingId(stored.editingId)
        }
        setDraftReady(true)
      }
    })
  }, [userId, setCustomerLabel, setEnv, setEditingId])

  const envFingerprint = useMemo(
    () => DEPLOYMENT_ENV_KEYS.map((k) => env[k] ?? '').join('\u0001'),
    [env],
  )

  useEffect(() => {
    if (!userId || !draftReady) return
    const t = window.setTimeout(() => {
      const envRecord: Record<string, string> = {}
      for (const k of DEPLOYMENT_ENV_KEYS) {
        envRecord[k] = env[k] ?? ''
      }
      writeDeployBotSessionDraft(userId, {
        customerLabel,
        env: envRecord,
        editingId,
      })
    }, 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `env` fields are represented by `envFingerprint`
  }, [userId, draftReady, customerLabel, editingId, envFingerprint])
}
