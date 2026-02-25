import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { Home, Users, Upload, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import TopBar from '@/components/TopBar'
import { useAuth } from '@/context/AuthContext'
import { BrandAdminProvider } from '@/context/BrandAdminContext'
import BrandAdminDashboard from '@/pages/brand-admin/BrandAdminDashboard'
import BrandAdminRepView from '@/pages/brand-admin/BrandAdminRepView'
import BrandAdminUpload from '@/pages/brand-admin/BrandAdminUpload'

function BrandAdminLayout() {
  const { signOut } = useAuth()
  const [signOutOpen, setSignOutOpen] = useState(false)

  return (
    <BrandAdminProvider>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-20 bg-zinc-900 flex flex-col py-4 shrink-0 items-center">
          {/* App logo */}
          <NavLink to="/app" className="flex items-center justify-center mb-1 px-1">
            <img src="/vertical-logo.png" alt="RepCommish" className="w-14 object-contain" />
          </NavLink>

          <div className="border-t border-zinc-700 w-12 mb-3" />

          <div className="flex-1" />

          {/* Navigation */}
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
              <Home className="size-5" />
            </NavLink>
            <NavLink
              to="/app/reps"
              title="My Reps"
              className={({ isActive }) =>
                `flex items-center justify-center p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#005b5b] text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-600'
                }`
              }
            >
              <Users className="size-5" />
            </NavLink>
            <NavLink
              to="/app/upload"
              title="Upload"
              className={({ isActive }) =>
                `flex items-center justify-center p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#005b5b] text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-600'
                }`
              }
            >
              <Upload className="size-5" />
            </NavLink>
          </nav>

          {/* Sign Out */}
          <div className="mt-4 px-2 w-full">
            <button
              onClick={() => setSignOutOpen(true)}
              title="Sign Out"
              className="flex items-center justify-center w-full p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-600 transition-colors"
            >
              <LogOut className="size-6 shrink-0" />
            </button>
          </div>
        </aside>

        {/* Sign Out confirmation */}
        <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Sign Out</DialogTitle>
              <DialogDescription>Are you sure you want to sign out?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSignOutOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { setSignOutOpen(false); signOut() }}>Sign Out</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          <TopBar />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route index element={<BrandAdminDashboard />} />
              <Route path="reps" element={<BrandAdminDashboard />} />
              <Route path="reps/:repId/companies/:companyId" element={<BrandAdminRepView />} />
              <Route path="upload" element={<BrandAdminUpload />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrandAdminProvider>
  )
}

export default BrandAdminLayout
