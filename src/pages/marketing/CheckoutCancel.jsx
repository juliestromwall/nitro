import { Link } from 'react-router-dom'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

function CheckoutCancel() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <XCircle className="size-16 text-zinc-400 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">
          Payment cancelled
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Your payment was not processed. You can try again whenever you're ready.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/signup">
            <Button size="lg" className="bg-[#005b5b] hover:bg-[#007a7a]">
              Try Again
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline">
              View Plans
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default CheckoutCancel
