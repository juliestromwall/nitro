import { useState } from 'react'
import { Copy, Check, Link } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'

function InviteBrandAdminModal({ open, onOpenChange, companyId }) {
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function generateInvite() {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

      const response = await fetch(`${supabaseUrl}/functions/v1/create-brand-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ companyId }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create invite')

      const link = `${window.location.origin}/invite/${data.invite.invite_code}`
      setInviteLink(link)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose(open) {
    if (!open) {
      setInviteLink('')
      setCopied(false)
      setError('')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Brand Admin</DialogTitle>
          <DialogDescription>
            Generate a shareable link for your brand's admin to connect. The link expires in 7 days.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {!inviteLink ? (
          <Button
            onClick={generateInvite}
            disabled={loading}
            className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                Generating...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Link className="size-4" />
                Generate Invite Link
              </span>
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 bg-transparent text-sm text-zinc-700 dark:text-zinc-300 outline-none"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              Share this link with your brand's admin. They'll create an account (or log in) and be automatically connected.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default InviteBrandAdminModal
