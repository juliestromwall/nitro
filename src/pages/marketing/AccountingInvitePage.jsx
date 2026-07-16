import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

// Rep-facing acceptance of an accounting connection invite.
// Mirrors InvitePage but hits accept-accounting-invite and does NOT change the
// rep's role (they stay a paying rep).
function AccountingInvitePage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [status, setStatus] = useState('loading') // loading | accepting | success | error
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) {
      setStatus('error')
      setError('No invite code provided.')
      return
    }
    if (!user) {
      // Not logged in — bounce to login, which will return here after auth.
      navigate(`/login?ainvite=${code}`, { replace: true })
      return
    }
    acceptInvite()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, user])

  async function acceptInvite() {
    setStatus('accepting')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

      const response = await fetch(`${supabaseUrl}/functions/v1/accept-accounting-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ inviteCode: code }),
      })

      const data = await response.json()
      if (!response.ok) {
        setStatus('error')
        setError(data.error || 'Failed to accept invite.')
        return
      }
      setStatus('success')
      setTimeout(() => navigate('/app', { replace: true }), 2000)
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Something went wrong.')
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-6">
      <div className="w-full max-w-sm text-center">
        <img src="/repcommish-logo.png" className="h-20 mx-auto mb-6 dark:invert" alt="RepCommish" />

        {(status === 'loading' || status === 'accepting') && (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-300 border-t-[#005b5b] mx-auto" />
            <p className="text-zinc-500">{status === 'loading' ? 'Validating invite…' : 'Connecting to accounting…'}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">You're connected to accounting!</h2>
            <p className="text-zinc-500">Redirecting…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Invite Error</h2>
            <p className="text-zinc-500">{error}</p>
            <Link to="/app" className="inline-block mt-4 px-4 py-2 bg-[#005b5b] text-white rounded-lg hover:bg-[#007a7a] transition-colors">
              Go to App
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default AccountingInvitePage
