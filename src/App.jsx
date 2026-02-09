import { Routes, Route, NavLink } from 'react-router-dom'
import { Building2, Users, LayoutDashboard, LogOut } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import { CompanyProvider, useCompanies } from './context/CompanyContext'
import { ClientProvider } from './context/ClientContext'
import { SalesProvider } from './context/SalesContext'
import { TodoProvider } from './context/TodoContext'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Clients from './pages/Clients'
import Login from './pages/Login'

const navItems = [
  { to: '/companies', icon: Building2, label: 'Companies' },
  { to: '/clients', icon: Users, label: 'Clients' },
]

function CompanyIcons() {
  const { activeCompanies } = useCompanies()

  return (
    <div className="flex flex-col items-center gap-3">
      {activeCompanies.map((company) => (
        <NavLink
          key={company.id}
          to={`/companies/${company.id}`}
          className={({ isActive }) =>
            `flex items-center justify-center w-11 h-11 rounded-lg transition-colors overflow-hidden ${
              isActive
                ? 'ring-2 ring-white'
                : 'opacity-70 hover:opacity-100'
            }`
          }
          title={company.name}
        >
          {company.logo_path ? (
            <img
              src={company.logo_path}
              alt={company.name}
              className="w-9 h-9 invert object-contain"
            />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-zinc-700 flex items-center justify-center text-white text-sm font-bold">
              {company.name.charAt(0)}
            </div>
          )}
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
    <ClientProvider>
    <SalesProvider>
    <TodoProvider>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-16 bg-zinc-900 flex flex-col items-center py-4 shrink-0">
          {/* Company quick links */}
          <CompanyIcons />

          <div className="w-8 border-t border-zinc-700 my-4" />

          <nav className="flex flex-col items-center gap-4">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white text-zinc-900'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`
              }
              title="Dashboard"
            >
              <LayoutDashboard className="size-5" />
            </NavLink>
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                  `flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white text-zinc-900'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`
                }
                title={label}
              >
                <Icon className="size-5" />
              </NavLink>
            ))}
          </nav>

          {/* Sign Out — pushed to bottom */}
          <div className="mt-auto">
            <button
              onClick={signOut}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Sign Out"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:id" element={<CompanyDetail />} />
            <Route path="/clients" element={<Clients />} />
          </Routes>
        </main>
      </div>
    </TodoProvider>
    </SalesProvider>
    </ClientProvider>
    </CompanyProvider>
  )
}

export default App
