import { useState, useRef, useCallback, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Tag, Store, BarChart3, LogOut, Home, RotateCcw } from 'lucide-react'
import TopBar from '@/components/TopBar'
import { useAuth } from '@/context/AuthContext'
import { CompanyProvider, useCompanies } from '@/context/CompanyContext'
import { AccountProvider } from '@/context/AccountContext'
import { SalesProvider } from '@/context/SalesContext'
import { TodoProvider } from '@/context/TodoContext'
import Dashboard from '@/pages/Dashboard'
import Companies from '@/pages/Companies'
import CompanyDetail from '@/pages/CompanyDetail'
import Accounts from '@/pages/Accounts'

function CompanyLinks() {
  const { activeCompanies } = useCompanies()

  return (
    <div className="flex flex-col gap-2 w-full px-2 overflow-y-auto scrollbar-none">
      {activeCompanies.map((company) => (
        <NavLink
          key={company.id}
          to={`/app/companies/${company.id}`}
          title={company.name}
          className={({ isActive }) =>
            `flex items-center justify-center p-2 rounded-lg transition-colors ${
              isActive
                ? 'bg-[#005b5b]'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-600'
            }`
          }
        >
          {company.logo_path ? (
            <div className="w-9 h-9 shrink-0 rounded bg-white flex items-center justify-center p-0.5">
              <img
                src={company.logo_path}
                alt={company.name}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-9 h-9 shrink-0 rounded bg-zinc-700 flex items-center justify-center text-white text-sm font-bold">
              {company.name.charAt(0)}
            </div>
          )}
        </NavLink>
      ))}
    </div>
  )
}

function AppLayout() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [showHomeMenu, setShowHomeMenu] = useState(false)
  const [homeConfirm, setHomeConfirm] = useState(null) // 'set' | 'reset'
  const longPressTimer = useRef(null)
  const menuRef = useRef(null)

  const homepageKey = user ? `homepage-${user.id}` : null

  const getHomePath = useCallback(() => {
    if (!homepageKey) return '/app'
    try {
      const saved = JSON.parse(localStorage.getItem(homepageKey))
      if (saved?.path) {
        // Migrate old paths without /app prefix
        const path = saved.path.startsWith('/app') ? saved.path : `/app${saved.path}`
        return path
      }
      return '/app'
    } catch {
      return '/app'
    }
  }, [homepageKey])

  const handleSetHomepage = () => {
    const path = location.pathname
    // Read current tab from CompanyDetail's localStorage if on a company page
    const companyMatch = path.match(/^\/app\/companies\/(\d+)$/)
    const homepage = { path }
    if (companyMatch) {
      const tab = localStorage.getItem(`activeTab-${companyMatch[1]}`)
      if (tab) homepage.tab = tab
    }
    localStorage.setItem(homepageKey, JSON.stringify(homepage))
    setShowHomeMenu(false)
    setHomeConfirm('set')
    setTimeout(() => setHomeConfirm(null), 1500)
  }

  const handleResetHomepage = () => {
    localStorage.removeItem(homepageKey)
    setShowHomeMenu(false)
    setHomeConfirm('reset')
    setTimeout(() => setHomeConfirm(null), 1500)
  }

  const handlePointerDown = () => {
    longPressTimer.current = setTimeout(() => {
      setShowHomeMenu(true)
    }, 500)
  }

  const handlePointerUp = () => {
    clearTimeout(longPressTimer.current)
  }

  // Close menu on outside click
  useEffect(() => {
    if (!showHomeMenu) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowHomeMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showHomeMenu])

  const homePath = getHomePath()

  return (
    <CompanyProvider>
    <AccountProvider>
    <SalesProvider>
    <TodoProvider>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-20 bg-zinc-900 flex flex-col py-4 shrink-0 items-center">
          {/* App logo — click navigates to homepage, long-press shows menu */}
          <div className="relative">
            <NavLink
              to={homePath}
              className="flex items-center justify-center mb-1 px-1"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onContextMenu={(e) => {
                e.preventDefault()
                setShowHomeMenu(true)
              }}
            >
              <img src="/vertical-logo.png" alt="RepCommish" className="w-14 object-contain" />
            </NavLink>

            {/* Confirmation toast */}
            {homeConfirm && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-zinc-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg z-50 animate-in fade-in slide-in-from-left-2">
                {homeConfirm === 'set' ? 'Homepage saved!' : 'Reset to Dashboard'}
              </div>
            )}

            {/* Long-press popover */}
            {showHomeMenu && (
              <div
                ref={menuRef}
                className="absolute left-full top-0 ml-2 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700 py-1 z-50 min-w-[200px] animate-in fade-in slide-in-from-left-2"
              >
                <button
                  onClick={handleSetHomepage}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  <Home className="size-4" />
                  Set current page as homepage
                </button>
                <button
                  onClick={handleResetHomepage}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                >
                  <RotateCcw className="size-4" />
                  Reset to Dashboard
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-700 w-12 mb-3" />

          {/* Brand quick links */}
          <CompanyLinks />

          <div className="border-t border-zinc-700 w-12 my-3" />

          {/* Navigation — icon only */}
          <nav className="flex flex-col gap-2 px-2 w-full mt-auto">
            <NavLink
              to="/app"
              end
              title="Dashboard"
              className={({ isActive }) =>
                `flex items-center justify-center p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#005b5b] text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-600'
                }`
              }
            >
              <BarChart3 className="size-5" />
            </NavLink>
            <NavLink
              to="/app/companies"
              end
              title="My Brands"
              className={({ isActive }) =>
                `flex items-center justify-center p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#005b5b] text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-600'
                }`
              }
            >
              <Tag className="size-5" />
            </NavLink>
            <NavLink
              to="/app/accounts"
              end
              title="Accounts"
              className={({ isActive }) =>
                `flex items-center justify-center p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#005b5b] text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-600'
                }`
              }
            >
              <Store className="size-5" />
            </NavLink>
          </nav>

          {/* Sign Out — pushed to bottom */}
          <div className="mt-4 px-2 w-full">
            <button
              onClick={signOut}
              title="Sign Out"
              className="flex items-center justify-center w-full p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-600 transition-colors"
            >
              <LogOut className="size-6 shrink-0" />
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          <TopBar />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="companies" element={<Companies />} />
              <Route path="companies/:id" element={<CompanyDetail />} />
              <Route path="accounts" element={<Accounts />} />
            </Routes>
          </main>
        </div>
      </div>
    </TodoProvider>
    </SalesProvider>
    </AccountProvider>
    </CompanyProvider>
  )
}

export default AppLayout
