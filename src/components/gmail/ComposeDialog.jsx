// Compose and send as the connected Gmail account.
//
// Deliberately unlike the abc-surrogacy compose it's modelled on: there is no
// required tag and no required account. A recipient is the only thing that
// gates Send. An account can be passed in for context — it fills the merge
// fields and files the send under that account — but it never blocks.

import { useMemo, useRef, useState } from 'react'
import { Paperclip, Send, X, Loader2, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGmail } from '@/context/GmailContext'
import { sendEmail, fileToAttachment, textToHtml } from '@/lib/gmail'
import { EMAIL_TEMPLATES, applyTemplate } from '@/lib/emailTemplates'
import RecipientField from '@/components/gmail/RecipientField'

// Attachments are base64'd twice on the way to Gmail (once into the JSON body,
// again when the MIME message is encoded), so the wire size is roughly 1.8x the
// files. 10MB keeps the whole chain inside Gmail's 25MB message limit.
const MAX_TOTAL_BYTES = 10 * 1024 * 1024

const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const toList = (v) =>
  Array.isArray(v) ? v : String(v || '').split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean)

export default function ComposeDialog({
  open, onOpenChange, to = '', subject = '', body = '',
  account, accountName, directory = [], templateVars, onSent,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        {open && (
          <ComposeForm
            key={`${Array.isArray(to) ? to.join(',') : to}|${subject}`}
            initialTo={toList(to)}
            initialSubject={subject}
            initialBody={body}
            account={account}
            accountName={accountName || account?.name}
            directory={directory}
            templateVars={templateVars}
            onClose={() => onOpenChange(false)}
            onSent={onSent}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ComposeForm({
  initialTo, initialSubject, initialBody, account, accountName, directory, templateVars, onClose, onSent,
}) {
  const { connected, googleEmail, sendAs, connect } = useGmail()
  const [to, setTo] = useState(initialTo)
  const [cc, setCc] = useState([])
  const [bcc, setBcc] = useState([])
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const [text, setText] = useState(initialBody)
  const [templateId, setTemplateId] = useState('blank')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState(null)
  const fileInput = useRef(null)

  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files])
  const tooBig = totalBytes > MAX_TOTAL_BYTES

  const fromLabel = sendAs?.sendAsEmail || googleEmail || ''
  const fromName = sendAs?.displayName || ''

  const addFiles = (list) => {
    setFiles((prev) => [...prev, ...Array.from(list)])
    if (fileInput.current) fileInput.current.value = ''
  }

  // Applying a template replaces subject + body. Warn first if there's work to lose.
  const chooseTemplate = (id) => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === id)
    if (!template) return
    const dirty = text.trim() || subject.trim()
    if (id !== 'blank' && dirty && !window.confirm('Replace the current subject and message with this template?')) {
      return
    }
    setTemplateId(id)
    if (id === 'blank') return
    const filled = applyTemplate(template, { ...templateVars, my_name: fromName || templateVars?.my_name || '' }, to)
    setSubject(filled.subject)
    setText(filled.body)
  }

  const send = async () => {
    if (!to.length || sending) return
    setSending(true)
    setError('')
    try {
      const attachments = await Promise.all(files.map(fileToAttachment))
      const result = await sendEmail({
        to: to.join(', '),
        cc: cc.length ? cc.join(', ') : undefined,
        bcc: bcc.length ? bcc.join(', ') : undefined,
        subject,
        body: textToHtml(text),
        attachments,
      })
      onSent?.({
        messageId: result.id || null,
        to: to.join(', '),
        subject,
        accountId: account?.id || null,
        accountName: accountName || null,
      })
      // Confirm in place rather than vanishing — a send is worth acknowledging.
      setSentTo(to.join(', '))
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(
        err.actionRequired === 'reconnect'
          ? 'Google access expired — reconnect your Gmail account and try again.'
          : err.message || 'Failed to send'
      )
    }
    setSending(false)
  }

  if (!connected) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Connect Gmail to send</DialogTitle>
          <DialogDescription>
            Sending uses your own Foundry Gmail account, so replies come back to your inbox.
          </DialogDescription>
        </DialogHeader>
        <div className="py-6 flex justify-center">
          <Button onClick={connect}>Connect Gmail</Button>
        </div>
      </>
    )
  }

  if (sentTo) {
    return (
      <div className="py-10 flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center justify-center size-12 rounded-full bg-emerald-600 shadow-sm">
          <Check className="size-6 text-white" />
        </span>
        <div>
          <p className="font-semibold">Sent</p>
          <p className="text-sm text-muted-foreground break-all">to {sentTo}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New Message</DialogTitle>
        <DialogDescription>
          Sending as {fromName ? `${fromName} <${fromLabel}>` : fromLabel}
          {accountName ? ` · ${accountName}` : ''}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-2">
        <div className="flex items-end justify-between gap-3">
          <div className="flex-1 min-w-0">
            <RecipientField
              label="To"
              value={to}
              onChange={setTo}
              directory={directory}
              autoFocus={!initialTo.length}
            />
          </div>
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground pb-2 shrink-0"
            >
              Cc / Bcc
            </button>
          )}
        </div>

        {showCc && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RecipientField label="Cc" value={cc} onChange={setCc} directory={directory} />
            <RecipientField label="Bcc" value={bcc} onChange={setBcc} directory={directory} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_190px] gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Past-due invoices"
              autoFocus={Boolean(initialTo.length)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            <select
              value={templateId}
              onChange={(e) => chooseTemplate(e.target.value)}
              className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
            >
              {EMAIL_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Message</Label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files) }}
            onDragOver={(e) => e.preventDefault()}
            placeholder="Hi — checking in on the invoices below…"
            className="w-full min-h-[220px] rounded-lg border bg-background p-3 text-sm resize-y placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#005b5b]/30"
          />
          {sendAs?.signature && (
            <p className="text-[11px] text-muted-foreground">
              Your Gmail signature is appended automatically.
            </p>
          )}
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                <span className="truncate">
                  {f.name} <span className="text-muted-foreground">({fmtBytes(f.size)})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Remove"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <p className={`text-[11px] ${tooBig ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              {fmtBytes(totalBytes)} attached{tooBig ? ' — 10 MB max per email' : ''}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <DialogFooter className="sm:justify-between gap-2">
        <div>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
            <Paperclip className="size-4 mr-1" /> Attach
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={!to.length || sending || tooBig}>
            {sending
              ? <><Loader2 className="size-4 mr-1 animate-spin" /> Sending…</>
              : <><Send className="size-4 mr-1" /> Send</>}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
