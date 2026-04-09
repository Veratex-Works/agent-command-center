import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function AdminSessionsPage() {
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
        <h1 className="text-2xl font-bold text-content m-0">Admin / Sessions</h1>
        <p className="text-muted text-sm mt-2 mb-0 max-w-xl">
          Link client accounts to bot chat sessions — coming soon.
        </p>
      </div>
    </div>
  )
}
