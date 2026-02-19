import { useEffect, useState, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

function CheckoutSuccess() {
  const { user, subscription, refreshSubscription, signUp, updateProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const [ready, setReady] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const registrationStarted = useRef(false)

  // Complete registration for new users (account created after payment)
  useEffect(() => {
    if (registrationStarted.current) return

    const sessionId = searchParams.get('session_id')
    const savedEmail = sessionStorage.getItem('rc_signup_email')
    const savedPassword = sessionStorage.getItem('rc_signup_password')

    // New user flow: we have stored credentials + session_id but no user yet
    if (savedEmail && savedPassword && sessionId && !user) {
      registrationStarted.current = true
      completeRegistration(savedEmail, savedPassword, sessionId)
    }
  }, [user, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const completeRegistration = async (email, password, sessionId) => {
    setRegistering(true)
    try {
      // Create the Supabase account
      const { user: newUser } = await signUp(email, password)
      if (!newUser) {
        setError('Account creation failed. Please try signing up again.')
        return
      }

      // Link user to Stripe subscription via edge function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const response = await fetch(`${supabaseUrl}/functions/v1/complete-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ userId: newUser.id, sessionId }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to link subscription')
      }

      // Save name to user metadata if provided
      const savedFirstName = sessionStorage.getItem('rc_signup_first_name')
      const savedLastName = sessionStorage.getItem('rc_signup_last_name')
      if (savedFirstName || savedLastName) {
        try {
          await updateProfile({ first_name: savedFirstName || '', last_name: savedLastName || '' })
        } catch (err) {
          console.error('Failed to save name:', err)
        }
      }

      // Clear stored credentials
      sessionStorage.removeItem('rc_signup_email')
      sessionStorage.removeItem('rc_signup_password')
      sessionStorage.removeItem('rc_signup_plan')
      sessionStorage.removeItem('rc_signup_first_name')
      sessionStorage.removeItem('rc_signup_last_name')

      // Refresh subscription state in AuthContext
      await refreshSubscription()
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.message || 'Something went wrong completing your registration.')
    } finally {
      setRegistering(false)
    }
  }

  // Hard timeout: show the button after 8 seconds no matter what
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true)
    }, 8000)
    return () => clearTimeout(timer)
  }, [])

  // Poll for subscription to become active/trialing
  useEffect(() => {
    if (!user) return
    if (registering) return
    if (ready) return

    const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'

    if (isActive) {
      setReady(true)
      return
    }

    // Poll every 1.5 seconds, up to 10 attempts
    if (attempts >= 10) {
      setReady(true)
      return
    }

    const timer = setTimeout(async () => {
      await refreshSubscription()
      setAttempts((a) => a + 1)
    }, 1500)

    return () => clearTimeout(timer)
  }, [user, subscription, attempts, refreshSubscription, registering, ready])

  if (error) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <AlertCircle className="size-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
            Something went wrong
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">{error}</p>
          <Link
            to="/signup"
            className="inline-flex items-center px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm"
          >
            Try again
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <CheckCircle className="size-16 text-emerald-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">
          You're all set!
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Your account is ready. Start tracking your sales and commissions.
        </p>

        {ready ? (
          <Link
            to="/app"
            className="inline-flex items-center px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm shadow-lg shadow-[#005b5b]/25"
          >
            Go to Dashboard
          </Link>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" />
            {registering ? 'Creating your account...' : 'Activating your account...'}
          </div>
        )}
      </div>
    </div>
  )
}

export default CheckoutSuccess
