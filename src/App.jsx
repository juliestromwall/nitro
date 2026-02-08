import { Routes, Route, NavLink, Link } from 'react-router-dom'
import { Building2, Users, ShoppingCart, DollarSign, LayoutDashboard } from 'lucide-react'
import { CompanyProvider, useCompanies } from './context/CompanyContext'
import { SalesProvider } from './context/SalesContext'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Clients from './pages/Clients'
import Sales from './pages/Sales'
import Commission from './pages/Commission'

const navItems = [
  { to: '/companies', icon: Building2, label: 'Companies' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/sales', icon: ShoppingCart, label: 'Sales' },
  { to: '/commission', icon: DollarSign, label: 'Commission' },
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
          {company.logo ? (
            <img
              src={company.logo}
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
  return (
    <CompanyProvider>
    <SalesProvider>
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
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:id" element={<CompanyDetail />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/commission" element={<Commission />} />
          </Routes>
        </main>
      </div>
    </SalesProvider>
    </CompanyProvider>
  )
}

export default App
