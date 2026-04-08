import type { ChatMessage } from '@/types'

interface MessageProps {
  message: ChatMessage
}

export function Message({ message }: MessageProps) {
  const { type, content, ts, variant } = message

  if (type === 'system') {
    const variantClass =
      variant === 'warn'
        ? 'border-[#5a3a20] text-[#c8804a]'
        : variant === 'ok'
          ? 'border-[#2a5a40] text-accent2'
          : 'border-border text-dim'

    return (
      <div className="flex self-center animate-msg-in max-w-[90%]">
        <div
          className={`font-mono text-[11px] px-3.5 py-1.5 rounded-full border bg-transparent ${variantClass}`}
        >
          {content}
        </div>
      </div>
    )
  }

  const isUser = type === 'user'

  return (
    <div
      className={`flex flex-col max-w-[82%] animate-msg-in ${
        isUser ? 'self-end items-end' : 'self-start items-start'
      }`}
    >
      {ts && (
        <div className="font-mono text-[10px] text-dim mb-1 px-1">
          {ts}
        </div>
      )}
      <div
        className={`px-[15px] py-[11px] rounded-[12px] text-sm leading-[1.65] break-words whitespace-pre-wrap ${
          isUser
            ? 'bg-user-bubble border border-user-border rounded-br-[3px] text-accent2'
            : 'bg-surface border border-border rounded-bl-[3px] text-content'
        }`}
      >
        {content}
      </div>
    </div>
  )
}
