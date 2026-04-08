import { useChatStore } from '@/store/useChatStore'
import type { ConnectionStatus } from '@/types'

const STATUS_STYLES: Record<ConnectionStatus, { pill: string; dot: string; pulse?: boolean }> = {
  connected: {
    pill: 'text-accent2 border-[#2a5a40]',
    dot: 'bg-accent2 shadow-[0_0_6px_var(--color-accent2)]',
  },
  connecting: {
    pill: 'text-accent border-[#4a5a10]',
    dot: 'bg-accent animate-pulse-dot',
  },
  error: {
    pill: 'text-danger border-[#5a2020]',
    dot: 'bg-danger',
  },
  disconnected: {
    pill: 'text-muted border-border',
    dot: 'bg-dim',
  },
}

export function StatusPill() {
  const { connectionStatus, statusText } = useChatStore()
  const styles = STATUS_STYLES[connectionStatus]

  return (
    <div
      className={`flex items-center gap-1.5 font-mono text-[11px] bg-surface2 border rounded-full px-2.5 py-1 transition-all duration-300 ${styles.pill}`}
    >
      <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${styles.dot}`} />
      <span>{statusText}</span>
    </div>
  )
}
