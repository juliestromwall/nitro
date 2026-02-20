import { useState } from 'react'
import { Moon, Sun, HelpCircle, RotateCcw, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import UserSettingsDialog from '@/components/UserSettingsDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

function TopBar() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const avatarUrl = user?.user_metadata?.avatar_url

  const handleRestartTour = () => {
    setHelpOpen(false)
    setTimeout(() => {
      if (user) {
        localStorage.removeItem(`repcommish_tour_done_${user.id}`)
        supabase.auth.updateUser({ data: { tour_done: false } }).catch(() => {})
      }
      window.dispatchEvent(new Event('restart-tour'))
    }, 300)
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 px-4 py-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle dark mode">
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)} title="Help & Support" data-tour="help-button">
          <HelpCircle className="size-5" />
        </Button>
        <button
          onClick={() => setSettingsOpen(true)}
          data-tour="user-settings"
          className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-[#005b5b] transition-all"
          title="User settings"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-zinc-500 dark:text-zinc-300">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          )}
        </button>
      </div>

      <UserSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Help & Support Modal */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">Need a Hand? We Got You.</DialogTitle>
            <DialogDescription className="text-center">
              Don't worry, we won't judge. We've all stared at a screen wondering "what does this button do?" at least once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Contact */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#005b5b]/10 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-[#005b5b]" />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-zinc-900 dark:text-white mb-1">Questions? Problems? Existential crisis about commissions?</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                    Shoot us an email and we'll get back to you faster than your accounts pay their invoices.
                  </p>
                  <a
                    href="mailto:hello@repcommish.com"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#005b5b] hover:bg-[#004848] text-white rounded-md transition-colors"
                  >
                    <Mail className="w-3 h-3" />
                    hello@repcommish.com
                  </a>
                </div>
              </div>
            </div>

            {/* Restart Tour */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#005b5b]/10 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4 text-[#005b5b]" />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-zinc-900 dark:text-white mb-1">Missed the tour? No shame in a redo.</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                    Maybe you were "multitasking" (scrolling on your phone) the first time around. We get it. Here's your second chance.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestartTour}
                    className="gap-1.5 text-xs h-7"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restart Tour
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default TopBar
