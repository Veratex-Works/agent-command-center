import { useEffect } from 'react'
import { useChatStore } from '@/store/useChatStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Header } from '@/components/Header'
import { MessageList } from '@/components/MessageList'
import { InputArea } from '@/components/InputArea'
import { ConnectPrompt } from '@/components/ConnectPrompt'
import { SettingsPanel } from '@/components/SettingsPanel'

export default function App() {
  const { showConnectPrompt } = useChatStore()
  const { connect, disconnect, sendMessage, abortRun, reconnect } = useWebSocket()

  useEffect(() => {
    if (!showConnectPrompt) {
      void connect()
    }
    return () => disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-base text-content font-sans">
      {showConnectPrompt && <ConnectPrompt onConnect={connect} />}
      <SettingsPanel onAbort={abortRun} onReconnect={reconnect} />
      <Header />
      <MessageList />
      <InputArea onSend={sendMessage} onAbort={abortRun} />
    </div>
  )
}
