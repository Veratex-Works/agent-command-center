import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function SuperadminGate({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-base text-content font-sans">
        <p className="text-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (profile?.role !== 'superadmin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
