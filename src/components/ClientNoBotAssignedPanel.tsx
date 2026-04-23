import { Link } from 'react-router-dom'

/**
 * Shown when a signed-in client has no bot deployment assigned, or assignment has no gateway URL yet.
 * They must not use the manual gateway form (only superadmin picks arbitrary gateways).
 */
export function ClientNoBotAssignedPanel() {
  return (
    <div className="fixed inset-0 z-50 bg-base flex items-center justify-center p-5">
      <div className="bg-surface border border-border rounded-[20px] p-9 w-full max-w-[440px] flex flex-col gap-4">
        <div className="text-xl font-extrabold text-content tracking-tight">No bot chat yet</div>
        <p className="text-muted text-sm leading-relaxed m-0">
          Your account is not linked to a deployed OpenClaw bot, or the bot does not have a gateway URL yet. An
          administrator should create a deployment in <strong className="text-content">Deploy bot</strong>, assign
          you to it, run <strong className="text-content">Deploy</strong>, then{' '}
          <strong className="text-content">Post-deploy</strong> so chat can connect.
        </p>
        <p className="text-dim text-[12px] leading-relaxed m-0">
          You will not be asked to paste a gateway URL here — only your assigned bot is used once it is ready.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-surface2 border border-border text-content text-sm font-semibold px-4 py-2.5 rounded-lg hover:border-accent"
          >
            OK
          </Link>
        </div>
      </div>
    </div>
  )
}
