import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

function ProtectedRoute({ children }) {
  const { user, loading, subscription } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen">
        <aside className="w-20 bg-zinc-900 shrink-0" />
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-300 border-t-[#005b5b]" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Invited users must set a password before accessing the app
  if (user.invited_at && !user.user_metadata?.setup_complete) {
    return <Navigate to="/welcome" replace />
  }

  // Only block users whose subscription exists and is in a bad state.
  // Users with no subscription row (e.g. free/comp accounts) are allowed through
  // since new signups defer account creation until after Stripe payment.
  const blocked = ['canceled', 'unpaid', 'past_due']
  if (subscription && blocked.includes(subscription.status)) {
    return <Navigate to="/signup?resume=true" replace />
  }

  return children
}

export default ProtectedRoute
