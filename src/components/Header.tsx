import { Trash2, Settings } from 'lucide-react'
import { useChatStore } from '@/store/useChatStore'
import { HeartbeatLight } from '@/components/HeartbeatLight'
import { StatusPill } from '@/components/StatusPill'

export function Header() {
  const { clearMessages, setSettingsOpen } = useChatStore()

  return (
    <header className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface flex-shrink-0 gap-3">
      <div className="flex items-center gap-2.5">
        <div className="text-xl font-extrabold tracking-tight text-accent">
          🦞 <span className="text-muted font-normal">openclaw</span>
        </div>
        <StatusPill />
        <HeartbeatLight />
      </div>

      <div className="flex gap-2 items-center">
        <button
          onClick={clearMessages}
          title="Clear chat"
          className="bg-surface2 border border-border text-muted w-[34px] h-[34px] rounded-lg cursor-pointer flex items-center justify-center transition-all duration-150 hover:border-accent hover:text-accent"
        >
          <Trash2 size={15} />
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="bg-surface2 border border-border text-muted w-[34px] h-[34px] rounded-lg cursor-pointer flex items-center justify-center transition-all duration-150 hover:border-accent hover:text-accent"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
