import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useChatStore } from '@/store/useChatStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { MessageList } from '@/components/MessageList'
import { InputArea } from '@/components/InputArea'
import { ClientNoBotAssignedPanel } from '@/components/ClientNoBotAssignedPanel'
import { SuperadminBotConnectPanel } from '@/components/SuperadminBotConnectPanel'
import { SettingsPanel } from '@/components/SettingsPanel'
import { setWsChatLogSessionKeyGetter } from '@/lib/websocketChatLog'
import { getDefaultSessionKeyForUser, sessionKeyFromSessionQueryParam } from '@/lib/sessionKey'
import { fetchMyBotDeployment } from '@/services/botDeployments'

export function ChatPage() {
  const { showConnectPrompt, setShowConnectPrompt } = useChatStore()
  const configUrl = useChatStore((s) => s.config.url)
  const setConfig = useChatStore((s) => s.setConfig)
  const { user, profile } = useAuth()
  const [assignmentChecked, setAssignmentChecked] = useState(false)
  const [searchParams] = useSearchParams()
  const sessionKeyFromUrl = useMemo(
    () => sessionKeyFromSessionQueryParam(searchParams.get('session')),
    [searchParams],
  )

  const getFallbackSessionKey = useCallback(
    () => (user?.id ? getDefaultSessionKeyForUser(user.id) : undefined),
    [user],
  )

  const { connect, disconnect, sendMessage, abortRun, reconnect } = useWebSocket(getFallbackSessionKey)
  const connectRef = useRef(connect)
  const disconnectRef = useRef(disconnect)
  connectRef.current = connect
  disconnectRef.current = disconnect

  /** One browser tab + localStorage: never inherit another account's gateway, messages, or WS. */
  const lastBootstrappedUserIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!user?.id) return
    if (lastBootstrappedUserIdRef.current === user.id) return
    lastBootstrappedUserIdRef.current = user.id
    disconnectRef.current()
    useChatStore.getState().bootstrapChatForSignedInUser(user.id, true)
  }, [user?.id, profile?.role])

  useEffect(() => {
    setWsChatLogSessionKeyGetter(() => useChatStore.getState().config.sessionKey)
    return () => setWsChatLogSessionKeyGetter(() => '')
  }, [])

  useEffect(() => {
    if (sessionKeyFromUrl) {
      const c = useChatStore.getState().config
      setConfig({ ...c, sessionKey: sessionKeyFromUrl })
      return
    }
    if (!user?.id || profile?.role === 'superadmin') return
    const key = getDefaultSessionKeyForUser(user.id)
    const c = useChatStore.getState().config
    setConfig({ ...c, sessionKey: key })
  }, [user?.id, profile?.role, setConfig, sessionKeyFromUrl])

  useEffect(() => {
    if (!user?.id) return
    if (profile?.role === 'superadmin') {
      setAssignmentChecked(true)
      return
    }
    if (profile?.role !== 'user') {
      setAssignmentChecked(true)
      return
    }
    let cancelled = false
    setAssignmentChecked(false)
    void (async () => {
      const row = await fetchMyBotDeployment()
      if (cancelled) return
      setAssignmentChecked(true)
      if (!row) {
        setShowConnectPrompt(false)
        return
      }
      const env = row.deployment_env
      const url = env.OPENCLAW_GATEWAY_URL?.trim()
      if (!url) {
        setShowConnectPrompt(false)
        return
      }
      const token = env.OPENCLAW_GATEWAY_TOKEN?.trim() ?? ''
      const c = useChatStore.getState().config
      const sk =
        sessionKeyFromUrl ?? (user.id ? getDefaultSessionKeyForUser(user.id) : c.sessionKey)
      const prevUrl = (c.url ?? '').trim()
      const prevToken = (c.token ?? '').trim()
      const prevSk = (c.sessionKey ?? '').trim()
      const nextSk = (sk ?? '').trim()
      const gatewayChanged = prevUrl !== url || prevToken !== token
      const sessionChanged = prevSk !== nextSk
      setConfig({
        ...c,
        url,
        token,
        sessionKey: sk,
      })
      setShowConnectPrompt(false)
      if (gatewayChanged || sessionChanged) {
        disconnectRef.current()
        void connectRef.current()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, profile?.role, setConfig, setShowConnectPrompt, sessionKeyFromUrl])

  useEffect(() => {
    if (!useChatStore.getState().showConnectPrompt) {
      void connect()
    }
    return () => disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isSuperadmin = profile?.role === 'superadmin'
  const isClient = profile?.role === 'user'
  const profileReady = profile != null

  if (!profileReady) {
    return (
      <p className="p-5 text-muted text-sm font-sans m-0">Loading profile…</p>
    )
  }

  return (
    <>
      {isSuperadmin && showConnectPrompt && !configUrl.trim() ? (
        <SuperadminBotConnectPanel onConnect={connect} />
      ) : null}
      {isClient && assignmentChecked && !configUrl.trim() ? <ClientNoBotAssignedPanel /> : null}
      <SettingsPanel onAbort={abortRun} onReconnect={reconnect} />
      <MessageList />
      <InputArea onSend={sendMessage} onAbort={abortRun} />
    </>
  )
}
