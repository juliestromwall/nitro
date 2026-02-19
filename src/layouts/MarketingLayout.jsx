import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import MarketingHeader from '@/components/marketing/MarketingHeader'
import MarketingFooter from '@/components/marketing/MarketingFooter'
import { useAuth } from '@/context/AuthContext'

function MarketingLayout() {
  const { pathname, hash } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])

  // Redirect invited users who haven't set a password to /welcome
  useEffect(() => {
    if (user && user.invited_at && !user.user_metadata?.setup_complete && pathname !== '/welcome') {
      navigate('/welcome', { replace: true })
    }
  }, [user, pathname, navigate])

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
