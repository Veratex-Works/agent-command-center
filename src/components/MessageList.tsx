import { useEffect, useRef } from 'react'
import { useChatStore } from '@/store/useChatStore'
import { Message } from '@/components/Message'
import { TypingIndicator } from '@/components/TypingIndicator'

export function MessageList() {
  const { messages, isTyping } = useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const isEmpty = messages.length === 0 && !isTyping

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-1 scroll-smooth scrollbar-thin">
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted text-center py-10">
          <div className="text-4xl opacity-40">🦞</div>
          <div className="text-lg font-bold text-muted">No messages yet</div>
          <div className="font-mono text-xs text-dim max-w-[260px] leading-relaxed">
            Connect to your OpenClaw gateway and start chatting
          </div>
        </div>
      ) : (
        <>
          {messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}
          {isTyping && <TypingIndicator />}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
