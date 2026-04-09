import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function DeployBotPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto p-5 gap-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-muted text-sm font-semibold hover:text-accent transition-colors"
        >
          <ArrowLeft size={16} />
          Back to chat
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-content m-0">Deploy bot</h1>
        <p className="text-muted text-sm mt-2 mb-0 max-w-xl">
          Placeholder for deployment configuration. API keys and secrets will be stored via
          Supabase Edge Functions and project secrets, not in the browser.
        </p>
      </div>

      <form
        className="bg-surface border border-border rounded-2xl p-6 max-w-xl flex flex-col gap-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
            API key (placeholder)
          </label>
          <input
            type="password"
            disabled
            placeholder="Not persisted yet"
            className="bg-surface2 border border-border text-dim font-mono text-[13px] px-3 py-2.5 rounded-lg w-full cursor-not-allowed"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
            Environment (placeholder)
          </label>
          <input
            type="text"
            disabled
            placeholder="e.g. staging"
            className="bg-surface2 border border-border text-dim font-mono text-[13px] px-3 py-2.5 rounded-lg w-full cursor-not-allowed"
          />
        </div>
        <p className="text-dim text-xs m-0">Scaffolding only — wiring will be added later.</p>
      </form>
    </div>
  )
}
