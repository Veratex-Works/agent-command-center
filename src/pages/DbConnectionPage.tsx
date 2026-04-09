import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSupabasePing } from '@/hooks/useSupabasePing'

export function DbConnectionPage() {
  const { status, message, ping } = useSupabasePing()

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
        <h1 className="text-2xl font-bold text-content m-0">DB-Connection</h1>
        <p className="text-muted text-sm mt-2 mb-0 max-w-xl">
          Supabase connectivity and future monitoring. Connection tests use your signed-in
          session and RLS-backed tables.
        </p>
      </div>

      <section className="bg-surface border border-border rounded-2xl p-6 max-w-xl flex flex-col gap-4">
        <h2 className="text-lg font-bold text-content m-0">Connection</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void ping()}
            disabled={status === 'checking'}
            className="bg-surface2 border border-border text-content font-sans text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {status === 'checking' ? 'Testing…' : 'Test Supabase connection'}
          </button>
          {status !== 'idle' && message && (
            <span
              className={`font-mono text-[13px] ${
                status === 'ok'
                  ? 'text-emerald-400'
                  : status === 'unconfigured'
                    ? 'text-dim'
                    : 'text-red-400'
              }`}
            >
              {message}
            </span>
          )}
        </div>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-6 max-w-xl flex flex-col gap-2">
        <h2 className="text-lg font-bold text-content m-0">Monitoring</h2>
        <p className="text-muted text-sm m-0">
          Metrics and query health will appear here (coming soon).
        </p>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-6 max-w-xl flex flex-col gap-2">
        <h2 className="text-lg font-bold text-content m-0">Client sessions</h2>
        <p className="text-muted text-sm m-0">
          Link client accounts to bot chat sessions will be configured here. For a dedicated
          view, see{' '}
          <Link to="/admin/sessions" className="text-accent font-semibold hover:underline">
            Admin / Sessions
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
