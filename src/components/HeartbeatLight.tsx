import { useChatStore } from '@/store/useChatStore'

function formatHeartbeatTooltip(at: number, ok: boolean, reason?: string, status?: string): string {
  const when = new Date(at).toLocaleString()
  const outcome = ok ? 'OK' : 'failed'
  const bits = [`Heartbeat ${outcome}`, when]
  if (status) bits.push(`status: ${status}`)
  if (reason) bits.push(`reason: ${reason}`)
  return bits.join('\n')
}

export function HeartbeatLight() {
  const { heartbeatIndicator } = useChatStore()

  const title = heartbeatIndicator
    ? formatHeartbeatTooltip(
        heartbeatIndicator.at,
        heartbeatIndicator.ok,
        heartbeatIndicator.reason,
        heartbeatIndicator.status,
      )
    : 'No heartbeat yet from gateway'

  const dotClass =
    heartbeatIndicator === null
      ? 'bg-dim'
      : heartbeatIndicator.ok
        ? 'bg-accent2 shadow-[0_0_6px_var(--color-accent2)]'
        : 'bg-danger shadow-[0_0_6px_var(--color-danger)]'

  const pulse = heartbeatIndicator?.ok === true

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-accent hover:text-content"
    >
      <span className="text-dim">hb</span>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${dotClass} ${pulse ? 'animate-pulse-dot' : ''}`}
      />
    </button>
  )
}
