import { Routes, Route, NavLink, Link } from 'react-router-dom'
import { Building2, Users, ShoppingCart, DollarSign } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import Clients from './pages/Clients'
import Sales from './pages/Sales'
import Commission from './pages/Commission'

const navItems = [
  { to: '/companies', icon: Building2, label: 'Companies' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/sales', icon: ShoppingCart, label: 'Sales' },
  { to: '/commission', icon: DollarSign, label: 'Commission' },
]

function App() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-16 bg-zinc-900 flex flex-col items-center py-4 shrink-0">
        <Link to="/" title="Dashboard">
          <img
            src="/nitro-icon.png"
            alt="Nitro"
            className="w-9 h-9 mb-6 invert"
          />
        </Link>
        <nav className="flex flex-col items-center gap-4">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
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
          <Route path="/clients" element={<Clients />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/commission" element={<Commission />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
