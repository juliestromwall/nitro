import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

function MarketingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // Scroll to hash after navigation
  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [location])

  const handleFaqClick = (e) => {
    e.preventDefault()
    setMobileOpen(false)
    if (location.pathname === '/pricing') {
      document.querySelector('#faq')?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate('/pricing#faq')
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-6 h-24 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img src="/repcommish-logo.png" alt="REPCOMMISH" className="h-20 dark:invert" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors pb-1 ${
                  isActive
                    ? 'text-[#005b5b] dark:text-teal-400 border-b-2 border-[#005b5b] dark:border-teal-400'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border-b-2 border-transparent'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <a
            href="/pricing#faq"
            onClick={handleFaqClick}
            className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors pb-1 border-b-2 border-transparent"
          >
            FAQs
          </a>
        </nav>

        {/* Auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Log In
          </Link>
          <Link
            to="/signup"
            className="text-sm font-medium bg-[#005b5b] hover:bg-[#007a7a] text-white px-4 py-2 rounded-lg transition-colors"
          >
            Sign Up
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 text-zinc-600 dark:text-zinc-400"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-4 space-y-3">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block text-sm font-medium py-2 ${
                  isActive
                    ? 'text-[#005b5b] dark:text-teal-400'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <a
            href="/pricing#faq"
            onClick={handleFaqClick}
            className="block text-sm font-medium py-2 text-zinc-600 dark:text-zinc-400"
          >
            FAQs
          </a>
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-zinc-600 dark:text-zinc-400 py-2"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium bg-[#005b5b] text-white px-4 py-2 rounded-lg text-center"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

export default MarketingHeader
