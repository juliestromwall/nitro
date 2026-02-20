import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase, nukeSession } from '@/lib/supabase'
import { fetchSubscription } from '@/lib/db'
import { DEFAULT_ROLE } from '@/lib/constants'

// Timeout wrapper — prevents auth calls from hanging on stale sessions
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Your session has expired. Please sign in again.')), ms)),
  ])
}

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [subscription, setSubscription] = useState(undefined) // undefined = loading, null = none
  const [loading, setLoading] = useState(true)

  // Bulletproof sign out — always works, even if the auth lock is stuck.
  // Clears localStorage directly instead of relying on supabase.auth.signOut().
  const forceSignOut = () => {
    nukeSession()
    setUser(null)
    setSubscription(null)
    window.location.href = '/login'
  }

  // Idle timeout — force sign out after 4 hours of no activity
  const lastActivityRef = useRef(Date.now())
  useEffect(() => {
    if (!user) return
    const IDLE_LIMIT = 4 * 60 * 60 * 1000 // 4 hours
    const resetTimer = () => { lastActivityRef.current = Date.now() }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_LIMIT) {
        forceSignOut()
      }
    }, 60_000)

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      clearInterval(interval)
    }
  }, [user])

  useEffect(() => {
    let mounted = true

    // Safety timeout — never stay stuck on loading
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        setSubscription(null)
        setLoading(false)
      }
    }, 5000)

    // Get initial session then validate token before allowing data fetches
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        if (mounted) setLoading(false)

        // Fetch subscription in background (non-blocking)
        fetchSubscription(currentUser.id).then((sub) => {
          if (mounted) setSubscription(sub)
        }).catch(() => {
          if (mounted) setSubscription(null)
        })
      } else {
        if (mounted) {
          setSubscription(null)
          setLoading(false)
        }
      }
    }).catch(() => {
      if (mounted) {
        setSubscription(null)
        setLoading(false)
      }
    })

    // Listen for subsequent auth changes (sign in, sign out, token refresh)
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        // If the token refresh failed, the session is dead — force sign out
        if (event === 'TOKEN_REFRESHED' && !session) {
          forceSignOut()
          return
        }

        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (currentUser) {
          try {
            const sub = await fetchSubscription(currentUser.id)
            if (mounted) setSubscription(sub)
          } catch {
            if (mounted) setSubscription(null)
          }
        } else {
          if (mounted) setSubscription(null)
        }
      }
    )

    // Session refresh — runs when tab becomes visible (after sleep/tab switch).
    // Proactively refreshes the JWT so DB calls don't fail with expired tokens.
    let checking = false
    const refreshOnWake = async () => {
      if (!mounted || checking || document.hidden) return
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession) return
      checking = true
      try {
        const { data, error } = await Promise.race([
          supabase.auth.refreshSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
        ])
        if (error || !data.session) {
          // Refresh failed — token is truly dead, sign out
          if (mounted) forceSignOut()
        }
      } catch {
        // Timeout or network error — don't sign out, the token might still work
      } finally {
        checking = false
      }
    }
    document.addEventListener('visibilitychange', refreshOnWake)

    return () => {
      mounted = false
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', refreshOnWake)
      authSub.unsubscribe()
    }
  }, [])

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return data
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signInWithProvider = async (provider) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/app`,
      },
    })
    if (error) throw error
    return data
  }

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
    return data
  }

  const verifyResetCode = async (email, code, newPassword) => {
    // Call edge function to verify code + update password server-side
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const response = await fetch(`${supabaseUrl}/functions/v1/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({ email, token: code, newPassword }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to reset password')
    }

    // Password is updated — sign in normally
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: newPassword,
    })
    if (signInError) throw signInError
  }

  // Regular sign out — tries Supabase signOut with a timeout, falls back to nukeSession
  const signOut = async () => {
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ])
    } catch {
      // Supabase signOut hung or failed — nuke it directly
    }
    nukeSession()
    setUser(null)
    setSubscription(null)
  }

  const updateEmail = async (newEmail) => {
    const { data, error } = await withTimeout(supabase.auth.updateUser({ email: newEmail }))
    if (error) throw error
    return data
  }

  const updatePassword = async (newPassword) => {
    const { data, error } = await withTimeout(supabase.auth.updateUser({ password: newPassword }))
    if (error) throw error
    return data
  }

  const updateAvatar = async (url) => {
    const { data, error } = await withTimeout(supabase.auth.updateUser({ data: { avatar_url: url } }))
    if (error) throw error
    setUser(data.user)
    return data
  }

  const updateProfile = async (metadata) => {
    const { data, error } = await withTimeout(supabase.auth.updateUser({ data: metadata }))
    if (error) throw error
    setUser(data.user)
    return data
  }

  const refreshSubscription = async () => {
    if (!user) return
    try {
      const sub = await fetchSubscription(user.id)
      setSubscription(sub)
    } catch {
      setSubscription(null)
    }
  }

  const userRole = user?.app_metadata?.role || DEFAULT_ROLE

  return (
    <AuthContext.Provider value={{ user, userRole, loading, subscription, signUp, signIn, signInWithProvider, resetPassword, verifyResetCode, signOut, updateEmail, updatePassword, updateAvatar, updateProfile, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
