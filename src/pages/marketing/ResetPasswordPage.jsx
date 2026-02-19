import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

function ResetPasswordPage() {
  const { user, updatePassword, clearRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [expired, setExpired] = useState(false)

  // Clean up the leftover # from URL after Supabase processes the hash tokens
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // If Supabase hasn't established a session after 5 seconds, the link is expired/invalid
  useEffect(() => {
    if (user) return
    const timer = setTimeout(() => {
      if (!user) setExpired(true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await updatePassword(password)
      clearRecovery()
      setSuccess(true)
      setTimeout(() => navigate('/app', { replace: true }), 2000)
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-6">
        <div className="w-full max-w-sm text-center">
          <CheckCircle className="size-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Password updated</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Redirecting to your dashboard...
          </p>
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-6">
        <div className="w-full max-w-sm text-center">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Link expired</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            This password reset link has expired or is invalid. Please request a new one.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  // Show loading while waiting for Supabase to process recovery token
  if (!user) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-6">
        <div className="text-center">
          <Loader2 className="size-8 text-[#005b5b] animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Verifying reset link...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-20 mx-auto mb-4 dark:invert" />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Set new password</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Enter your new password below.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              minLength={6}
              required
              autoFocus
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
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            minLength={6}
            required
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
          />

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm shadow-lg shadow-[#005b5b]/25 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="size-4 animate-spin" /> Updating...</> : 'Update Password'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-6">
          <Link to="/login" className="text-[#005b5b] dark:text-teal-400 hover:underline font-medium">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ResetPasswordPage
