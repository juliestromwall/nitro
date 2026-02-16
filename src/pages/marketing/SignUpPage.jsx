import { useState } from 'react'
import { useSearchParams, Navigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

function SignUpPage() {
  const { user, signUp } = useAuth()
  const [searchParams] = useSearchParams()
  const preselectedPlan = searchParams.get('plan') || 'annual'

  const [plan, setPlan] = useState(preselectedPlan)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // If already logged in and not resuming checkout, go to app
  if (user && !searchParams.get('resume')) {
    return <Navigate to="/app" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Step 1: Create the user account
      const { user: newUser } = await signUp(email, password)

      // Step 2: Create checkout session via edge function
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          userId: newUser.id,
          email,
          plan,
        },
      })

      if (fnError) throw fnError
      if (data?.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // If user is resuming (already signed up but no subscription)
  const handleResumeCheckout = async () => {
    setError('')
    setLoading(true)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          userId: user.id,
          email: user.email,
          plan,
        },
      })

      if (fnError) throw fnError
      if (data?.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-20 mx-auto mb-2 dark:invert" />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {user ? 'Complete Your Subscription' : 'Create your account'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {user ? 'Choose a plan to get started.' : 'Start tracking your commissions today.'}
          </p>
        </CardHeader>
        <CardContent>
          {/* Plan Toggle */}
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 p-1 mb-6">
            <button
              type="button"
              onClick={() => setPlan('monthly')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                plan === 'monthly'
                  ? 'bg-[#005b5b] text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Monthly — $15/mo
            </button>
            <button
              type="button"
              onClick={() => setPlan('annual')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                plan === 'annual'
                  ? 'bg-[#005b5b] text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Annual — $144/yr
            </button>
          </div>

          {user ? (
            // Resume checkout for existing user without subscription
            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
                Signed in as <span className="font-medium">{user.email}</span>
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button onClick={handleResumeCheckout} className="w-full" disabled={loading}>
                {loading ? 'Redirecting to checkout...' : 'Continue to Payment'}
              </Button>
            </div>
          ) : (
            // New user signup form
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account & Pay'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-[#005b5b] hover:underline font-medium">
                  Log in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default SignUpPage
