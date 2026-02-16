import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import MarketingHeader from '@/components/marketing/MarketingHeader'
import MarketingFooter from '@/components/marketing/MarketingFooter'

const SITE_PASSWORD = 'BringMore$now!'
const STORAGE_KEY = 'repcommish-site-access'

function PasswordGate({ onUnlock }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password === SITE_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, 'true')
      onUnlock()
    } else {
      setError(true)
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-teal-50/30 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <img
          src="/repcommish-logo.png"
          alt="REPCOMMISH"
          className="h-20 mx-auto mb-8 dark:invert"
        />
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          Enter the password to view this site.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={`w-full px-4 py-3 rounded-lg border text-sm bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 outline-none transition-colors ${
              error
                ? 'border-red-400 ring-2 ring-red-400/20'
                : 'border-zinc-200 dark:border-zinc-700 focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20'
            }`}
            autoFocus
          />
          <button
            type="submit"
            className="w-full px-4 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm shadow-lg shadow-[#005b5b]/25"
          >
            Enter
          </button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-500">Incorrect password.</p>
        )}
      </div>
    </div>
  )
}

function MarketingLayout() {
  const [unlocked, setUnlocked] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  )

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-zinc-950">
      <MarketingHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  )
}

export default MarketingLayout
