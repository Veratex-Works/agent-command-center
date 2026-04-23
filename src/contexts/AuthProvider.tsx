import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { clearDeployBotSessionDraft } from '@/lib/deployBotSessionDraft'
import { useChatStore } from '@/store/useChatStore'
import { fetchProfile } from '@/services/profiles'
import type { Profile } from '@/types/database'
import type { Session, User } from '@supabase/supabase-js'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const userRef = useRef<User | null>(null)
  userRef.current = user
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
    } = supabase.auth.onAuthStateChange((event, s) => {
      void (async () => {
        if (cancelled) return
        setSession(s)
        setUser(s?.user ?? null)

        if (!s?.user) {
          setProfile(null)
          setLoading(false)
          return
        }

        // Token refresh updates the session only; profile is unchanged.
        if (event === 'TOKEN_REFRESHED') return

        // Initial session is handled by getSession() above; avoid duplicate loading UI.
        const showAuthLoading = event !== 'INITIAL_SESSION'

        if (showAuthLoading) setLoading(true)
        await loadProfile(s.user.id)
        if (cancelled) return
        if (showAuthLoading) setLoading(false)
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
    const emailRedirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/` : undefined
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    })
    if (error) return { error: error.message }
    const needsEmailConfirmation = Boolean(data.user) && !data.session
    return { error: null, needsEmailConfirmation }
  }, [])

  const resendSignupEmail = useCallback(async (email: string) => {
    if (!supabase) return { error: 'Supabase is not configured.' }
    setAuthError(null)
    const emailRedirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/` : undefined
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const uid = userRef.current?.id
    setAuthError(null)
    await supabase.auth.signOut()
    useChatStore.getState().clearChatForLogout()
    if (uid) clearDeployBotSessionDraft(uid)
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
      resendSignupEmail,
      signOut,
    }),
    [session, user, profile, loading, authError, signIn, signUp, resendSignupEmail, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
