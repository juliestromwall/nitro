import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Loader2, Eye, EyeOff } from 'lucide-react'


function Login() {
  const { user, signIn, resetPassword, verifyResetCode } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password flow
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  // Reset password step (after code is sent)
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // Prevent redirect to /app while we're resetting the password
  // (verifyResetCode signs the user in, which would trigger the redirect)
  const [resetting, setResetting] = useState(false)

  if (user && !resetting) {
    return <Navigate to="/app" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    setForgotLoading(true)
    try {
      await resetPassword(forgotEmail)
      setForgotSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setForgotLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setResetLoading(true)
    setResetting(true)
    try {
      await verifyResetCode(forgotEmail, resetCode, newPassword)
      // Password updated + user is signed in — hard redirect
      window.location.href = '/app'
    } catch (err) {
      setResetting(false)
      setResetLoading(false)
      const msg = err.message || ''
      if (msg.includes('otp') || msg.includes('token') || msg.includes('expired')) {
        setError('Invalid or expired code. Please check and try again.')
      } else {
        setError(msg || 'Something went wrong. Please try again.')
      }
    }
  }

  const handleBackToLogin = () => {
    setShowForgot(false)
    setForgotSent(false)
    setForgotEmail('')
    setResetCode('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setResetting(false)
  }

  if (showForgot) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-20 mx-auto mb-4 dark:invert" />
          </div>

          {forgotSent ? (
            /* Step 2: Enter code + new password */
            <>
              <h2 className="text-xl font-bold text-center text-zinc-900 dark:text-white mb-2">Reset your password</h2>
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                If <span className="font-medium text-zinc-700 dark:text-zinc-300">{forgotEmail}</span> is registered in our system, you'll receive a temporary password. Enter it below along with your new password.
              </p>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <input
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="Temporary password"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                />
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    minLength={6}
                    required
                    className="w-full px-4 py-3 pr-11 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  minLength={6}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                />

                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resetLoading ? <><Loader2 className="size-4 animate-spin" /> Updating...</> : 'Update Password'}
                </button>
              </form>
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-4">
                <button onClick={handleBackToLogin} className="text-[#005b5b] dark:text-teal-400 hover:underline font-medium">
                  Back to login
                </button>
              </p>
            </>
          ) : (
            /* Step 1: Enter email */
            <>
              <h2 className="text-xl font-bold text-center text-zinc-900 dark:text-white mb-2">Reset your password</h2>
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                Enter your email and we'll send you a temporary password.
              </p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                />
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {forgotLoading ? <><Loader2 className="size-4 animate-spin" /> Sending...</> : 'Send Temporary Password'}
                </button>
              </form>
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-4">
                <button onClick={handleBackToLogin} className="text-[#005b5b] dark:text-teal-400 hover:underline font-medium">
                  Back to login
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-20 mx-auto mb-4 dark:invert" />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Welcome back</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Sign in to your account</p>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
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

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm shadow-lg shadow-[#005b5b]/25 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="size-4 animate-spin" /> Signing in...</> : 'Log In'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-6">
          Need an account?{' '}
          <Link to="/signup" className="text-[#005b5b] dark:text-teal-400 hover:underline font-medium">Sign up</Link>
          {' '}&middot;{' '}
          <button onClick={() => setShowForgot(true)} className="text-[#005b5b] dark:text-teal-400 hover:underline font-medium">
            Forgot Password?
          </button>
        </p>
      </div>
    </div>
  )
}

export default Login
