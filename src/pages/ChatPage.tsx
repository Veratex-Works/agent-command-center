import { useEffect } from 'react'
import { useChatStore } from '@/store/useChatStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { MessageList } from '@/components/MessageList'
import { InputArea } from '@/components/InputArea'
import { ConnectPrompt } from '@/components/ConnectPrompt'
import { SettingsPanel } from '@/components/SettingsPanel'
import { setWsChatLogSessionKeyGetter } from '@/lib/websocketChatLog'

export function ChatPage() {
  const { showConnectPrompt } = useChatStore()
  const { connect, disconnect, sendMessage, abortRun, reconnect } = useWebSocket()

  useEffect(() => {
    setWsChatLogSessionKeyGetter(() => useChatStore.getState().config.sessionKey)
    return () => setWsChatLogSessionKeyGetter(() => '')
  }, [])

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
