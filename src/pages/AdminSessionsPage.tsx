import { Navigate } from 'react-router-dom'

/** Client–bot linking lives on Deploy bot; keep route for old bookmarks. */
export function AdminSessionsPage() {
  return <Navigate to="/deploy-bot" replace />
}
