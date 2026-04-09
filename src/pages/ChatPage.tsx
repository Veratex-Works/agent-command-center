import { useCallback, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useChatStore } from '@/store/useChatStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { MessageList } from '@/components/MessageList'
import { InputArea } from '@/components/InputArea'
import { ConnectPrompt } from '@/components/ConnectPrompt'
import { SettingsPanel } from '@/components/SettingsPanel'
import { setWsChatLogSessionKeyGetter } from '@/lib/websocketChatLog'
import { getDefaultSessionKeyForUser } from '@/lib/sessionKey'
import { fetchMyBotDeployment } from '@/services/botDeployments'

export function ChatPage() {
  const { showConnectPrompt } = useChatStore()
  const setConfig = useChatStore((s) => s.setConfig)
  const { user, profile } = useAuth()

  const getFallbackSessionKey = useCallback(
    () => (user?.id ? getDefaultSessionKeyForUser(user.id) : undefined),
    [user],
  )

  const { connect, disconnect, sendMessage, abortRun, reconnect } = useWebSocket(getFallbackSessionKey)

  useEffect(() => {
    setWsChatLogSessionKeyGetter(() => useChatStore.getState().config.sessionKey)
    return () => setWsChatLogSessionKeyGetter(() => '')
  }, [])

  useEffect(() => {
    if (!user?.id || profile?.role === 'superadmin') return
    const key = getDefaultSessionKeyForUser(user.id)
    const c = useChatStore.getState().config
    setConfig({ ...c, sessionKey: key })
  }, [user?.id, profile?.role, setConfig])

  useEffect(() => {
    if (!user?.id || profile?.role === 'superadmin') return
    let cancelled = false
    void (async () => {
      const row = await fetchMyBotDeployment()
      if (cancelled || !row) return
      const env = row.deployment_env
      const url = env.OPENCLAW_GATEWAY_URL?.trim()
      if (!url) return
      const c = useChatStore.getState().config
      if (c.url?.trim()) return
      const token = env.OPENCLAW_GATEWAY_TOKEN?.trim() ?? ''
      setConfig({
        ...c,
        url,
        token,
        sessionKey: getDefaultSessionKeyForUser(user.id),
      })
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, profile?.role, setConfig])

  useEffect(() => {
    if (!showConnectPrompt) {
      void connect()
    }
    return () => disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {showConnectPrompt && <ConnectPrompt onConnect={connect} />}
      <SettingsPanel onAbort={abortRun} onReconnect={reconnect} />
      <MessageList />
      <InputArea onSend={sendMessage} onAbort={abortRun} />
    </>
  )
}
