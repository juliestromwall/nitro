// Connection state for the signed-in user's Gmail account.
//
// Kept in one place so the compose window, the connect card, and any future
// inbox all agree on whether Gmail is available without each re-querying.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getGoogleStatus, disconnectGoogle, connectGoogle, getSendAs } from '@/lib/gmail'

const GmailContext = createContext(null)

export function GmailProvider({ children }) {
  const { user } = useAuth()
  const [status, setStatus] = useState({ connected: false })
  const [sendAs, setSendAs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus({ connected: false })
      setLoading(false)
      return
    }
    try {
      const s = await getGoogleStatus()
      setStatus(s)
      // Identity/signature only matter once connected, and it's one more
      // round trip — fetch lazily but eagerly enough that Compose opens ready.
      if (s.connected) {
        getSendAs().then(setSendAs).catch(() => setSendAs(null))
      } else {
        setSendAs(null)
      }
    } catch {
      setStatus({ connected: false })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  // The OAuth callback returns with ?google=connected|denied|error. Surface the
  // outcome, re-check status, then clean the URL so a refresh doesn't re-toast.
  const [lastResult, setLastResult] = useState(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('google')
    if (!result) return
    setLastResult(result)
    if (result === 'connected') refresh()
    params.delete('google')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, [refresh])

  const [connecting, setConnecting] = useState(false)
  const connect = useCallback(async () => {
    setError(null)
    setConnecting(true)
    try {
      // Navigates away on success, so `connecting` stays true deliberately.
      await connectGoogle()
    } catch (err) {
      setConnecting(false)
      setError(err?.message || 'Could not start Google sign-in.')
    }
  }, [])

  const disconnect = useCallback(async () => {
    setError(null)
    try {
      await disconnectGoogle()
      setStatus({ connected: false })
      setSendAs(null)
    } catch (err) {
      setError(err?.message || 'Could not disconnect.')
    }
  }, [])

  return (
    <GmailContext.Provider value={{
      loading, connecting, error, clearError: () => setError(null),
      connected: Boolean(status.connected), googleEmail: status.google_email || null,
      sendAs, lastResult, clearLastResult: () => setLastResult(null),
      connect, disconnect, refresh,
    }}>
      {children}
    </GmailContext.Provider>
  )
}

export function useGmail() {
  const ctx = useContext(GmailContext)
  if (!ctx) throw new Error('useGmail must be used inside a GmailProvider')
  return ctx
}
