import { Link } from 'react-router-dom'

function MarketingFooter() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-14 mb-3 dark:invert" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Built by a rep's wife. Because somebody had to fix this.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Product</h4>
            <ul className="space-y-2">
              <li><Link to="/features" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Features</Link></li>
              <li><Link to="/pricing" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Pricing</Link></li>
              <li><Link to="/about" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">About</Link></li>
              <li><Link to="/contact" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Account</h4>
            <ul className="space-y-2">
              <li><a href="https://app.repcommish.com/login" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Log In</a></li>
              <li><a href="https://app.repcommish.com/signup" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Sign Up</a></li>
              <li><a href="https://calendly.com/repcommish" target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Request a Demo</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Legal</h4>
            <ul className="space-y-2">
              <li><Link to="/terms" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Terms &amp; Conditions</Link></li>
              <li><Link to="/privacy" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800 text-center">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            &copy; {new Date().getFullYear()} REPCOMMISH. Made with love and a grudge against Excel.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default MarketingFooter
