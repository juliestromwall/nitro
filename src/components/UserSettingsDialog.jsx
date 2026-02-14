import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'
import { uploadAvatar } from '@/lib/db'

function UserSettingsDialog({ open, onOpenChange }) {
  const { user, updateEmail, updatePassword, updateAvatar } = useAuth()

  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileRef = useRef(null)

  const avatarUrl = user?.user_metadata?.avatar_url

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setAvatarUploading(true)
    try {
      const url = await uploadAvatar(user.id, file)
      await updateAvatar(url)
    } catch (err) {
      console.error('Avatar upload failed:', err)
    } finally {
      setAvatarUploading(false)
      if (fileRef.current) fileRef.current.value = ''
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
      setPasswordMsg('Password updated.')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordMsg(err.message || 'Failed to update password.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>User Settings</DialogTitle>
          <DialogDescription>Update your profile, email, or password.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Avatar */}
          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-zinc-200 flex items-center justify-center overflow-hidden shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-zinc-500">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={avatarUploading}>
                  {avatarUploading ? 'Uploading...' : 'Change Photo'}
                </Button>
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <Input
              placeholder="New email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <Button size="sm" onClick={handleEmailUpdate} disabled={!newEmail.trim()}>
              Update Email
            </Button>
            {emailMsg && <p className="text-xs text-muted-foreground">{emailMsg}</p>}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button size="sm" onClick={handlePasswordUpdate} disabled={!newPassword || !confirmPassword}>
              Update Password
            </Button>
            {passwordMsg && <p className="text-xs text-muted-foreground">{passwordMsg}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default UserSettingsDialog
