import { useState, useRef, useEffect, Component } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { useAuth } from '@/context/AuthContext'
import { Check, ArrowLeft, AlertCircle, Loader2, Shield, Eye, EyeOff } from 'lucide-react'


const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

// Error boundary to catch Stripe component crashes
class CheckoutErrorBoundary extends Component {
  state = { hasError: false, errorMsg: '' }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || 'Unknown error' }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <AlertCircle className="size-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">
            Something went wrong loading the payment form.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, errorMsg: '' })
              this.props.onRetry?.()
            }}
            className="px-4 py-2 text-sm bg-[#005b5b] text-white rounded-lg hover:bg-[#007a7a]"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function SignUpPage() {
  const { user, subscription } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const preselectedPlan = searchParams.get('plan') || 'annual'

  const [step, setStep] = useState(1)
  const [plan, setPlan] = useState(preselectedPlan)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [clientSecret, setClientSecret] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const checkoutStarted = useRef(false)

  // Only redirect if user has an ACTIVE subscription
  useEffect(() => {
    if (user && (subscription?.status === 'active' || subscription?.status === 'trialing') && !checkoutStarted.current) {
      navigate('/app', { replace: true })
    }
  }, [user, subscription, navigate])

  // If user is logged in and resuming checkout (existing user without subscription), auto-advance
  useEffect(() => {
    if (user && searchParams.get('resume') && !checkoutStarted.current) {
      startCheckout({ userId: user.id, email: user.email })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startCheckout = async ({ userId, email: checkoutEmail }) => {
    if (checkoutStarted.current) return
    checkoutStarted.current = true
    setStep(2)
    setCheckoutLoading(true)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const body = userId
        ? { userId, email: checkoutEmail, plan, embedded: true }
        : { email: checkoutEmail, plan, embedded: true }

      const response = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || `Server error ${response.status}`)
      }

      if (!data?.clientSecret) {
        throw new Error('No checkout session returned')
      }

      setClientSecret(data.clientSecret)
    } catch (err) {
      console.error('Checkout error:', err)
      setError(err.message || 'Could not start checkout. Please try again.')
      setStep(1)
      checkoutStarted.current = false
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleContinue = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (user) {
        // Existing user resuming checkout
        setLoading(false)
        await startCheckout({ userId: user.id, email: user.email })
      } else {
        // New user — defer account creation until after payment
        sessionStorage.setItem('rc_signup_email', email)
        sessionStorage.setItem('rc_signup_password', password)
        sessionStorage.setItem('rc_signup_plan', plan)
        sessionStorage.setItem('rc_signup_first_name', firstName)
        sessionStorage.setItem('rc_signup_last_name', lastName)
        setLoading(false)
        await startCheckout({ email })
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleRetry = () => {
    setClientSecret(null)
    checkoutStarted.current = false
    setStep(1)
    setError('')
  }

  const isAnnual = plan === 'annual'
  const planLabel = isAnnual ? 'Annual Plan' : 'Monthly Plan'
  const planPrice = isAnnual ? '$144' : '$15'
  const planInterval = isAnnual ? '/year' : '/month'
  const planSubtext = isAnnual ? '$12/month billed yearly' : 'Billed monthly'

  // ── Step 1: Account creation ─────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-6">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-16 mx-auto mb-6 dark:invert" />
          </div>

          <h1 className="text-3xl font-bold text-center text-zinc-900 dark:text-white mb-2">
            Let's Get Started
          </h1>
          <p className="text-center text-zinc-500 dark:text-zinc-400 mb-8">
            Start your free 7-day trial.
          </p>

          {/* Plan Toggle */}
          <div className="flex gap-3 mb-6">
            <button
              type="button"
              onClick={() => setPlan('monthly')}
              className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                plan === 'monthly'
                  ? 'border-[#005b5b] bg-[#005b5b]/5 text-[#005b5b] dark:text-teal-400 dark:border-teal-400'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
              }`}
            >
              <div className="font-semibold">Monthly</div>
              <div className="text-xs mt-0.5">$15/month</div>
            </button>
            <button
              type="button"
              onClick={() => setPlan('annual')}
              className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all relative ${
                plan === 'annual'
                  ? 'border-[#005b5b] bg-[#005b5b]/5 text-[#005b5b] dark:text-teal-400 dark:border-teal-400'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
              }`}
            >
              <div className="absolute -top-2.5 right-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                Save 20%
              </div>
              <div className="font-semibold">Annual</div>
              <div className="text-xs mt-0.5">$12/month billed yearly</div>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleContinue} className="space-y-4">
            {user ? (
              <div className="text-center py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Signed in as <span className="font-medium text-zinc-900 dark:text-white">{user.email}</span>
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="signup-first" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      First Name
                    </label>
                    <input
                      id="signup-first"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First"
                      required
                      className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="signup-last" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Last Name
                    </label>
                    <input
                      id="signup-last"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last"
                      required
                      className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="signup-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="signup-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      minLength={6}
                      required
                      className="w-full px-4 py-3 pr-11 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm shadow-lg shadow-[#005b5b]/25 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Continue with Email'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-[#005b5b] dark:text-teal-400 hover:underline font-medium">
              Log in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  // ── Step 2: Split-panel checkout ─────────────────────────
  return (
    <div className="min-h-[80vh] flex items-center justify-center py-8 px-4 sm:px-6">
      <div className="w-full max-w-5xl">
        <div className="flex flex-col lg:flex-row rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-xl">

          {/* Left Panel — Brand + Order Summary */}
          <div className="lg:w-[420px] shrink-0 bg-gradient-to-br from-[#005b5b] to-[#003d3d] text-white p-8 sm:p-10 flex flex-col">
            {/* Back + Logo */}
            <div className="flex items-center gap-3 mb-10">
              <button
                onClick={handleRetry}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="size-4" />
              </button>
              <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-8 invert" />
            </div>

            {/* Plan Info */}
            <div className="mb-8">
              <p className="text-teal-200 text-sm font-medium mb-1">{planLabel}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{planPrice}</span>
                <span className="text-teal-200 text-lg">{planInterval}</span>
              </div>
              <p className="text-teal-200/80 text-sm mt-1">{planSubtext}</p>
            </div>

            {/* Trial Badge */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-8 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <div className="size-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-semibold">7-Day Free Trial</span>
              </div>
              <p className="text-teal-200/80 text-xs leading-relaxed">
                You won't be charged today. Your trial starts now and you can cancel anytime.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-3 mb-auto">
              <p className="text-xs font-semibold text-teal-200/60 uppercase tracking-wider">What's included</p>
              {[
                'Unlimited brands & accounts',
                'Sales & order tracking',
                'Commission calculations',
                'Payment management',
                'To-do lists per brand',
                'Reporting & exports',
              ].map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400 shrink-0" />
                  <span className="text-sm text-teal-50">{f}</span>
                </div>
              ))}
            </div>

            {/* Security Note */}
            <div className="flex items-center gap-2 mt-8 pt-6 border-t border-white/10">
              <Shield className="size-4 text-teal-200/60 shrink-0" />
              <p className="text-xs text-teal-200/60">
                Secure payment powered by Stripe
              </p>
            </div>
          </div>

          {/* Right Panel — Stripe Embedded Checkout */}
          <div className="flex-1 bg-white dark:bg-zinc-900 min-h-[500px]">
            {checkoutLoading && (
              <div className="flex items-center justify-center h-full min-h-[500px]">
                <Loader2 className="size-6 animate-spin text-[#005b5b]" />
                <span className="ml-3 text-sm text-zinc-500">Loading payment form...</span>
              </div>
            )}

            {clientSecret && (
              <CheckoutErrorBoundary onRetry={handleRetry}>
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{ clientSecret }}
                >
                  <EmbeddedCheckout className="h-full" />
                </EmbeddedCheckoutProvider>
              </CheckoutErrorBoundary>
            )}

            {error && !checkoutLoading && (
              <div className="flex items-center justify-center h-full min-h-[500px]">
                <div className="text-center">
                  <AlertCircle className="size-8 text-red-500 mx-auto mb-3" />
                  <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 text-sm bg-[#005b5b] text-white rounded-lg hover:bg-[#007a7a]"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SignUpPage
