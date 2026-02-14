import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/useTheme'
import UserSettingsDialog from '@/components/UserSettingsDialog'

function TopBar() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const avatarUrl = user?.user_metadata?.avatar_url

  return (
    <>
      <div className="flex items-center justify-end gap-2 px-4 py-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle dark mode">
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
        <button
          onClick={() => setSettingsOpen(true)}
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
    </>
  )
}

export default TopBar
