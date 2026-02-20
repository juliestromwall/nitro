import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'
import { uploadAvatar } from '@/lib/db'
import { ROLE_LABELS } from '@/lib/constants'
import { ExternalLink, Camera, Check, Loader2 } from 'lucide-react'

function UserSettingsDialog({ open, onOpenChange }) {
  const { user, userRole, subscription, updateEmail, updatePassword, updateAvatar, updateProfile } = useAuth()
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')

  // Profile fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Avatar
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarDone, setAvatarDone] = useState(false)
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState(null)
  const fileRef = useRef(null)

  // Email / Password
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')

  const avatarUrl = pendingAvatarUrl || user?.user_metadata?.avatar_url

  // Sync fields only when dialog opens (not when user updates mid-operation)
  useEffect(() => {
    if (open && user) {
      setFirstName(user.user_metadata?.first_name || '')
      setLastName(user.user_metadata?.last_name || '')
      setPendingAvatarUrl(null)
      setAvatarDone(false)
      setSaveError('')
      setSaved(false)
      setEmailMsg('')
      setPasswordMsg('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setAvatarUploading(true)
    setAvatarDone(false)
    setSaveError('')
    try {
      const url = await uploadAvatar(user.id, file)
      // Show success immediately — don't block on auth update
      setPendingAvatarUrl(url)
      setAvatarDone(true)
      setAvatarUploading(false)
      // Persist to user profile in background
      updateAvatar(url).catch((err) => console.error('Avatar profile update failed:', err))
    } catch (err) {
      console.error('Avatar upload failed:', err)
      setSaveError('Photo upload failed. Please try again.')
      setAvatarUploading(false)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    setSaved(false)
    try {
      await updateProfile({ first_name: firstName.trim(), last_name: lastName.trim() })
      setSaved(true)
      setTimeout(() => onOpenChange(false), 500)
    } catch (err) {
      setSaveError(err.message?.includes('timed out') ? 'Save timed out. Please try again.' : (err.message || 'Failed to save profile.'))
    } finally {
      setSaving(false)
    }
  }

  const handleEmailUpdate = async () => {
    if (!newEmail.trim()) return
    setEmailMsg('')
    try {
      await updateEmail(newEmail.trim())
      setEmailMsg('Confirmation email sent to new address.')
      setNewEmail('')
    } catch (err) {
      setEmailMsg(err.message || 'Failed to update email.')
    }
  }

  const handlePasswordUpdate = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      setPasswordMsg('Passwords do not match.')
      return
    }
    setPasswordMsg('')
    try {
      await updatePassword(newPassword)
      setPasswordMsg('Password updated!')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordMsg(err.message || 'Failed to update password.')
    }
  }

  // Check if name was changed
  const nameChanged = firstName.trim() !== (user?.user_metadata?.first_name || '') ||
    lastName.trim() !== (user?.user_metadata?.last_name || '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>User Settings</DialogTitle>
          <DialogDescription>Update your profile, email, or password.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Profile section — Avatar + Name */}
          <div className="space-y-4">
            {/* Avatar — centered, clickable */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
                className="relative group"
              >
                <div className="w-20 h-20 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center overflow-hidden ring-2 ring-zinc-200 dark:ring-zinc-600 group-hover:ring-[#005b5b] transition-all">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-zinc-500 dark:text-zinc-400">
                      {user?.user_metadata?.first_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {/* Overlay */}
                  {avatarUploading ? (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <Loader2 className="size-6 text-white animate-spin" />
                    </div>
                  ) : avatarDone ? (
                    <div className="absolute inset-0 rounded-full bg-emerald-500/60 flex items-center justify-center animate-in fade-in duration-200">
                      <Check className="size-6 text-white" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                      <Camera className="size-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </div>
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
                className="text-xs text-muted-foreground hover:text-[#005b5b] transition-colors"
              >
                {avatarUploading ? 'Uploading...' : 'Change photo'}
              </button>
            </div>

            {/* Role badge */}
            <div className="flex justify-center">
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                {ROLE_LABELS[userRole] || 'Rep'}
              </span>
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">First name</Label>
                <Input
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setSaved(false) }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Last name</Label>
                <Input
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); setSaved(false) }}
                />
              </div>
            </div>

            {/* Save profile button */}
            {(nameChanged || saveError) && (
              <Button
                className="w-full bg-[#005b5b] hover:bg-[#007a7a] text-white"
                onClick={handleSave}
                disabled={saving || (!firstName.trim() && !lastName.trim())}
              >
                {saving ? (
                  <><Loader2 className="size-4 animate-spin mr-1" /> Saving...</>
                ) : saved ? (
                  <><Check className="size-4 mr-1" /> Saved!</>
                ) : (
                  'Save Changes'
                )}
              </Button>
            )}
            {saveError && <p className="text-xs text-red-500 text-center">{saveError}</p>}
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-200 dark:border-zinc-700" />

          {/* Email */}
          <div className="space-y-2">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <div className="flex gap-2">
              <Input
                placeholder="New email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" variant="outline" onClick={handleEmailUpdate} disabled={!newEmail.trim()}>
                Update
              </Button>
            </div>
            {emailMsg && (
              <p className={`text-xs ${emailMsg.includes('Failed') ? 'text-red-500' : 'text-emerald-600'}`}>{emailMsg}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {newPassword && (
                <Input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              )}
              {newPassword && (
                <Button size="sm" variant="outline" onClick={handlePasswordUpdate} disabled={!newPassword || !confirmPassword}>
                  Update Password
                </Button>
              )}
            </div>
            {passwordMsg && (
              <p className={`text-xs ${passwordMsg.includes('Failed') || passwordMsg.includes('match') ? 'text-red-500' : 'text-emerald-600'}`}>{passwordMsg}</p>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-200 dark:border-zinc-700" />

          {/* Subscription */}
          <div className="flex items-center justify-end">
            <div className="text-right">
              <p className="text-xs text-muted-foreground capitalize mb-1">
                {subscription?.plan || 'Free'} — {subscription?.status || 'none'}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={portalLoading}
                onClick={async () => {
                  setPortalLoading(true)
                  setPortalError('')
                  try {
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
                    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
                    const res = await fetch(`${supabaseUrl}/functions/v1/create-portal-session`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`,
                        'apikey': supabaseKey,
                      },
                      body: JSON.stringify({ userId: user.id }),
                    })
                    const data = await res.json()
                    if (data.url) {
                      window.location.href = data.url
                    } else {
                      setPortalError(data.error || 'Could not open billing portal.')
                    }
                  } catch (err) {
                    console.error('Portal error:', err)
                    setPortalError('Could not connect to billing portal.')
                  } finally {
                    setPortalLoading(false)
                  }
                }}
              >
                <ExternalLink className="size-3.5" />
                {portalLoading ? 'Loading...' : 'Manage Subscription'}
              </Button>
              {portalError && <p className="text-xs text-red-500 mt-1">{portalError}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default UserSettingsDialog
