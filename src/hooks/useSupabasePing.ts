import { useCallback, useState } from 'react'
import { pingSupabase } from '@/services/supabaseConnection'

export type SupabasePingStatus =
  | 'idle'
  | 'checking'
  | 'ok'
  | 'error'
  | 'unconfigured'

export function useSupabasePing() {
  const [status, setStatus] = useState<SupabasePingStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const ping = useCallback(async () => {
    setStatus('checking')
    setMessage(null)
    const result = await pingSupabase()
    if (result.ok) {
      setStatus('ok')
      setMessage('Connected.')
      return
    }
    setStatus(result.reason === 'unconfigured' ? 'unconfigured' : 'error')
    setMessage(result.message)
  }, [])

  return { status, message, ping }
}
