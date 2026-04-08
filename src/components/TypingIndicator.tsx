export function TypingIndicator() {
  return (
    <div className="flex self-start animate-msg-in">
      <div className="flex gap-[5px] items-center px-[15px] py-3 bg-surface border border-border rounded-[12px] rounded-bl-[3px] w-fit">
        <div className="typing-dot w-[5px] h-[5px] rounded-full bg-muted" />
        <div className="typing-dot w-[5px] h-[5px] rounded-full bg-muted" />
        <div className="typing-dot w-[5px] h-[5px] rounded-full bg-muted" />
      </div>
    </div>
  )
}
