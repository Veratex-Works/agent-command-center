import { useRef, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'
import { useChatStore } from '@/store/useChatStore'

interface InputAreaProps {
  onSend: (text: string) => void
  onAbort: () => void
}

export function InputArea({ onSend, onAbort }: InputAreaProps) {
  const { isRunning } = useChatStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const handleSend = () => {
    const el = textareaRef.current
    if (!el) return
    const text = el.value.trim()
    if (!text || isRunning) return
    onSend(text)
    el.value = ''
    el.style.height = 'auto'
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="px-5 py-3.5 border-t border-border bg-surface flex-shrink-0">
      <div className="flex gap-2.5 items-end bg-surface2 border border-border rounded-[12px] px-3.5 pt-2 pb-2 focus-within:border-[#3a4020] transition-colors duration-200">
        <textarea
          ref={textareaRef}
          placeholder="Message OpenClaw…"
          rows={1}
          onKeyDown={handleKey}
          onInput={autoResize}
          className="flex-1 bg-transparent border-none text-content font-sans text-sm leading-[1.5] resize-none outline-none min-h-[22px] max-h-[120px] overflow-y-auto placeholder:text-dim textarea-scrollbar"
        />

        {isRunning && (
          <button
            onClick={onAbort}
            title="Stop"
            className="bg-transparent border border-danger text-danger w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:bg-[rgba(255,90,90,0.1)]"
          >
            <Square size={14} fill="currentColor" />
          </button>
        )}

        <button
          onClick={handleSend}
          disabled={isRunning}
          title="Send (Enter)"
          className="bg-accent border-none w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center flex-shrink-0 text-base transition-all duration-150 hover:enabled:opacity-85 hover:enabled:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send size={16} color="#0a0c10" strokeWidth={2.5} />
        </button>
      </div>

      <div className="font-mono text-[10px] text-dim mt-2 text-center">
        Enter to send · Shift+Enter for newline
      </div>
    </div>
  )
}
