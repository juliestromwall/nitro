import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchSubscription } from '@/lib/db'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [subscription, setSubscription] = useState(undefined) // undefined = loading, null = none
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        try {
          const sub = await fetchSubscription(currentUser.id)
          setSubscription(sub)
        } catch {
          setSubscription(null)
        }
      }

      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (currentUser) {
          try {
            const sub = await fetchSubscription(currentUser.id)
            setSubscription(sub)
          } catch {
            setSubscription(null)
          }
        } else {
          setSubscription(undefined)
        }
      }
    )

    return () => authSub.unsubscribe()
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

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const updateEmail = async (newEmail) => {
    const { data, error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) throw error
    return data
  }

  const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    return data
  }

  const updateAvatar = async (url) => {
    const { data, error } = await supabase.auth.updateUser({ data: { avatar_url: url } })
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

  return (
    <AuthContext.Provider value={{ user, loading, subscription, signUp, signIn, signOut, updateEmail, updatePassword, updateAvatar, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
