import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

function ProtectedRoute({ children }) {
  const { user, loading, subscription } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // TODO: Re-enable subscription check once Stripe is set up
  // if (subscription !== undefined && subscription?.status !== 'active' && subscription?.status !== 'trialing') {
  //   return <Navigate to="/signup?resume=true" replace />
  // }

  return children
}

export default ProtectedRoute
