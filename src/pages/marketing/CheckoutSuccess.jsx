import { Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

function CheckoutSuccess() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <CheckCircle className="size-16 text-emerald-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">
          You're all set!
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Your payment was successful and your account is now active. Start tracking your sales and commissions.
        </p>
        <Link to="/app">
          <Button size="lg" className="bg-[#005b5b] hover:bg-[#007a7a]">
            Go to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default CheckoutSuccess
