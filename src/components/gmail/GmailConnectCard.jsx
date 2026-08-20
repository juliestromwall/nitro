// Connect / disconnect the user's Gmail account. Lives on the accounting
// Dashboard so it's reachable without a Settings page.

import { useState } from 'react'
import { Mail, Check, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useGmail } from '@/context/GmailContext'
import { useCrm } from '@/context/CrmContext'

const RESULT_MESSAGES = {
  denied: 'Google sign-in was cancelled.',
  error: "Couldn't finish connecting to Google. Try again.",
  no_refresh_token: 'Google did not return a refresh token — disconnect and reconnect, choosing "Allow" on every screen.',
}

const fmtWhen = (iso) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export default function GmailConnectCard() {
  const { loading, connected, connecting, error, clearError, googleEmail, sendAs, connect, disconnect, lastResult, clearLastResult } = useGmail()
  const { emailLog } = useCrm()
  const [busy, setBusy] = useState(false)

  const problem = lastResult && lastResult !== 'connected' ? RESULT_MESSAGES[lastResult] : null

  const handleDisconnect = async () => {
    setBusy(true)
    try { await disconnect() } finally { setBusy(false) }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`inline-flex items-center justify-center size-7 rounded-lg shadow-sm ${connected ? 'bg-emerald-600' : 'bg-zinc-500'}`}>
            <Mail className="size-4 text-white" />
          </span>
          Gmail
        </CardTitle>
        <CardDescription>
          Send from your own Foundry address so replies land in your inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {problem && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-600" />
            <span className="text-amber-900 dark:text-amber-200">{problem}</span>
            <button type="button" onClick={clearLastResult} className="ml-auto underline shrink-0">Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking…
          </div>
        ) : connected ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Check className="size-3.5 text-emerald-600" />
                <span className="truncate">{sendAs?.sendAsEmail || googleEmail}</span>
              </div>
              <p className="text-xs text-muted-foreground">Connected</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'Disconnect'}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button size="sm" onClick={connect} disabled={connecting}>
              {connecting
                ? <><Loader2 className="size-4 mr-1 animate-spin" /> Opening Google…</>
                : <><Mail className="size-4 mr-1" /> Connect Gmail</>}
            </Button>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span className="min-w-0">{error}</span>
                <button type="button" onClick={clearError} className="ml-auto underline shrink-0">Dismiss</button>
              </div>
            )}
          </div>
        )}

        {connected && emailLog.length > 0 && (
          <div className="pt-1 border-t space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-2">Recently sent</div>
            {emailLog.slice(0, 5).map((e) => (
              <div key={e.id} className="text-xs">
                <div className="truncate font-medium">{e.subject || '(no subject)'}</div>
                <div className="truncate text-muted-foreground">
                  {e.accountName ? `${e.accountName} · ` : ''}{e.to} · {fmtWhen(e.sentAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
