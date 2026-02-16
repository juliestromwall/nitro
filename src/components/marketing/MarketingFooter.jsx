import { Link } from 'react-router-dom'

function MarketingFooter() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-8 mb-3 dark:invert" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Sales and commission tracking built for independent sales reps.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Product</h4>
            <ul className="space-y-2">
              <li><Link to="/features" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Features</Link></li>
              <li><Link to="/pricing" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Pricing</Link></li>
              <li><Link to="/about" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">About</Link></li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Account</h4>
            <ul className="space-y-2">
              <li><Link to="/login" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Log In</Link></li>
              <li><Link to="/signup" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Sign Up</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800 text-center">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            &copy; {new Date().getFullYear()} REPCOMMISH. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default MarketingFooter
