import { Routes, Route, NavLink } from 'react-router-dom'
import { Building2, Users, LayoutDashboard, LogOut } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import { CompanyProvider, useCompanies } from './context/CompanyContext'
import { AccountProvider } from './context/AccountContext'
import { SalesProvider } from './context/SalesContext'
import { TodoProvider } from './context/TodoContext'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Accounts from './pages/Accounts'
import Login from './pages/Login'

function CompanyLinks() {
  const { activeCompanies } = useCompanies()

  return (
    <div className="flex flex-col gap-1 w-full px-3">
      {activeCompanies.map((company) => (
        <NavLink
          key={company.id}
          to={`/companies/${company.id}`}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`
          }
        >
          {company.logo_path ? (
            <img
              src={company.logo_path}
              alt={company.name}
              className="w-7 h-7 shrink-0 invert object-contain"
            />
          ) : (
            <div className="w-7 h-7 shrink-0 rounded bg-zinc-700 flex items-center justify-center text-white text-xs font-bold">
              {company.name.charAt(0)}
            </div>
          )}
          <span className="text-sm font-medium truncate">{company.name}</span>
        </NavLink>
      ))}
    </div>
  )
}

function App() {
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <CompanyProvider>
    <AccountProvider>
    <SalesProvider>
    <TodoProvider>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-56 bg-zinc-900 flex flex-col py-4 shrink-0">
          {/* App logo */}
          <NavLink to="/" className="flex items-center justify-center mb-4 px-4">
            <img src="/repcommish-nav.png" alt="RepCommish" className="h-20 object-contain" />
          </NavLink>

          <div className="border-t border-zinc-700 mx-3 mb-3" />

          {/* Company quick links */}
          <CompanyLinks />

          <div className="border-t border-zinc-700 mx-3 my-3" />

          {/* Navigation */}
          <nav className="flex flex-col gap-1 px-3">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white text-zinc-900'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`
              }
            >
              <LayoutDashboard className="size-5 shrink-0" />
              <span className="text-sm font-medium">Dashboard</span>
            </NavLink>
            <NavLink
              to="/companies"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white text-zinc-900'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`
              }
            >
              <Building2 className="size-5 shrink-0" />
              <span className="text-sm font-medium">My Companies</span>
            </NavLink>
            <NavLink
              to="/accounts"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white text-zinc-900'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`
              }
            >
              <Users className="size-5 shrink-0" />
              <span className="text-sm font-medium">Accounts</span>
            </NavLink>
          </nav>

          {/* Sign Out — pushed to bottom */}
          <div className="mt-auto px-3">
            <button
              onClick={signOut}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="size-5 shrink-0" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:id" element={<CompanyDetail />} />
            <Route path="/accounts" element={<Accounts />} />
          </Routes>
        </main>
      </div>
    </TodoProvider>
    </SalesProvider>
    </AccountProvider>
    </CompanyProvider>
  )
}

export default App
