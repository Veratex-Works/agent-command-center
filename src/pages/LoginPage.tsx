import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { user, loading, signIn, signUp, authError } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-base text-content font-sans">
        <p className="text-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    const fn = mode === 'signin' ? signIn : signUp
    const { error } = await fn(email.trim(), password)
    setSubmitting(false)
    if (error) setFormError(error)
  }

  const displayError = formError ?? authError

  return (
    <div className="min-h-dvh flex items-center justify-center bg-base text-content font-sans p-6">
      <div className="w-full max-w-[400px] flex flex-col gap-6 bg-surface border border-border rounded-2xl p-8">
        <div>
          <h1 className="text-xl font-bold text-content m-0">Sign in</h1>
          <p className="text-muted text-sm mt-2 mb-0">
            Use your account to access the chat. New users can create an account below.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('signin')
              setFormError(null)
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              mode === 'signin'
                ? 'bg-accent text-base border-accent'
                : 'bg-surface2 border-border text-muted hover:border-muted'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup')
              setFormError(null)
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              mode === 'signup'
                ? 'bg-accent text-base border-accent'
                : 'bg-surface2 border-border text-muted hover:border-muted'
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none focus:border-accent w-full"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-muted uppercase tracking-[0.05em]">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none focus:border-accent w-full"
            />
          </div>
          {displayError && (
            <p className="text-red-400 font-mono text-[12px] m-0">{displayError}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent text-base border-none py-3 rounded-lg font-sans text-sm font-bold cursor-pointer hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
