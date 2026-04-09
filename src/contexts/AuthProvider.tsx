import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AuthContext, type AuthContextValue } from '@/contexts/authContext'
import { supabase } from '@/lib/supabase'
import {
  getWsChatLogSessionKey,
  registerWsChatLogProductionSink,
} from '@/lib/websocketChatLog'
import { insertChatLogBatch } from '@/services/chatLogs'
import { fetchProfile } from '@/services/profiles'
import type { Profile } from '@/types/database'
import type { Session, User } from '@supabase/supabase-js'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    let p = await fetchProfile(userId)
    if (!p) {
      await new Promise((r) => setTimeout(r, 400))
      p = await fetchProfile(userId)
    }
    setProfile(p)
  }, [])

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => {
        setLoading(false)
        setAuthError('Supabase is not configured.')
      })
      return
    }

    let cancelled = false

    void (async () => {
      const {
        data: { session: s },
      } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) await loadProfile(s.user.id)
      else setProfile(null)
      if (!cancelled) setLoading(false)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      void (async () => {
        if (cancelled) return
        setSession(s)
        setUser(s?.user ?? null)
        if (s?.user) await loadProfile(s.user.id)
        else setProfile(null)
      })()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  useEffect(() => {
    if (!supabase || !user) {
      registerWsChatLogProductionSink(null)
      return
    }

    registerWsChatLogProductionSink(async (entries) => {
      const key = getWsChatLogSessionKey()
      await insertChatLogBatch(user.id, key.trim() || null, entries)
    })

    return () => {
      registerWsChatLogProductionSink(null)
    }
  }, [user])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase is not configured.' }
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase is not configured.' }
    setAuthError(null)
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    setAuthError(null)
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      authError,
      signIn,
      signUp,
      signOut,
    }),
    [session, user, profile, loading, authError, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
