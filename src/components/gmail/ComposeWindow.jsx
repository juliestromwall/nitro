// Gmail-style docked compose window.
//
// Sits bottom-right over whatever page you're on rather than taking the screen
// as a modal, so you can keep working with a draft open. Minimise collapses it
// to its title bar; expand takes it near-fullscreen. The draft is mirrored to
// localStorage, so a refresh — or opening the app in another tab — doesn't
// lose what you typed.
//
// Unlike the abc-surrogacy compose this is modelled on, nothing is required
// except a recipient: no tag, no account.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Paperclip, Send, X, Loader2, AlertTriangle, Check, Minus, Maximize2, Minimize2, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGmail } from '@/context/GmailContext'
import { sendEmail, fileToAttachment } from '@/lib/gmail'
import { EMAIL_TEMPLATES, applyTemplate } from '@/lib/emailTemplates'
import RecipientField from '@/components/gmail/RecipientField'
import RichTextArea from '@/components/gmail/RichTextArea'

// Attachments are base64'd twice on the way to Gmail, so the wire size is
// roughly 1.8x the files. 10MB keeps the chain inside Gmail's 25MB limit.
const MAX_TOTAL_BYTES = 10 * 1024 * 1024
const DRAFT_KEY = 'rc_compose_draft'

const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const toList = (v) =>
  Array.isArray(v) ? v : String(v || '').split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean)

const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null } catch { return null }
}

export default function ComposeWindow({ open, to = '', subject = '', body = '', ...rest }) {
  if (!open) return null
  const seedKey = `${Array.isArray(to) ? to.join(',') : to}|${subject}|${rest.account?.id || ''}`
  return <ComposeWindowInner key={seedKey} to={to} subject={subject} body={body} {...rest} />
}

function ComposeWindowInner({
  onClose, to, subject, body,
  account, accountName, directory = [], templateVars, onSent,
}) {
  const { connected, googleEmail, sendAs, connect, connecting, error: gmailError } = useGmail()

  // A saved draft only wins when the caller isn't prefilling anything.
  const seed = useMemo(() => {
    const seeded = toList(to)
    if (!seeded.length && !subject && !body) {
      const saved = loadDraft()
      if (saved) {
        return {
          recipients: saved.recipients || [], cc: saved.cc || [], bcc: saved.bcc || [],
          subj: saved.subj || '', html: saved.html || '',
        }
      }
    }
    return { recipients: seeded, cc: [], bcc: [], subj: subject || '', html: body || '' }
    // Deliberately mount-only: the parent remounts this via `key` when the
    // compose target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [recipients, setRecipients] = useState(seed.recipients)
  const [cc, setCc] = useState(seed.cc)
  const [bcc, setBcc] = useState(seed.bcc)
  const [subj, setSubj] = useState(seed.subj)
  const [html, setHtml] = useState(seed.html)
  const [templateId, setTemplateId] = useState('blank')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState(null)
  const fileInput = useRef(null)

  // Mirror the draft so a refresh doesn't lose it. Attachments are File
  // objects and can't be serialised, so they're deliberately not persisted.
  useEffect(() => {
    if (sentTo) return
    const draft = { recipients, cc, bcc, subj, html }
    const empty = !recipients.length && !cc.length && !bcc.length && !subj && !html
    try {
      if (empty) localStorage.removeItem(DRAFT_KEY)
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch { /* quota or private mode — the draft just won't persist */ }
  }, [sentTo, recipients, cc, bcc, subj, html])

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clean up */ }
  }, [])

  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files])
  const tooBig = totalBytes > MAX_TOTAL_BYTES
  const fromLabel = sendAs?.sendAsEmail || googleEmail || ''
  const fromName = sendAs?.displayName || ''

  const addFiles = (list) => {
    setFiles((prev) => [...prev, ...Array.from(list)])
    if (fileInput.current) fileInput.current.value = ''
  }

  const chooseTemplate = (id) => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === id)
    if (!template) return
    const dirty = subj.trim() || html.replace(/<[^>]*>/g, '').trim()
    if (id !== 'blank' && dirty && !window.confirm('Replace the current subject and message with this template?')) return
    setTemplateId(id)
    if (id === 'blank') return
    const filled = applyTemplate(template, { ...templateVars, my_name: fromName || templateVars?.my_name || '' }, recipients)
    setSubj(filled.subject)
    setHtml(filled.body.split(/\n{2,}/).map((b) => `<p>${b.replace(/\n/g, '<br>')}</p>`).join(''))
  }

  const discard = () => {
    if (subj.trim() || html.replace(/<[^>]*>/g, '').trim() || recipients.length) {
      if (!window.confirm('Discard this draft?')) return
    }
    clearDraft()
    onClose()
  }

  const send = async () => {
    if (!recipients.length || sending) return
    setSending(true)
    setError('')
    try {
      const attachments = await Promise.all(files.map(fileToAttachment))
      const result = await sendEmail({
        to: recipients.join(', '),
        cc: cc.length ? cc.join(', ') : undefined,
        bcc: bcc.length ? bcc.join(', ') : undefined,
        subject: subj,
        body: html,
        attachments,
      })
      onSent?.({
        messageId: result.id || null,
        to: recipients.join(', '),
        subject: subj,
        accountId: account?.id || null,
        accountName: accountName || null,
      })
      clearDraft()
      setSentTo(recipients.join(', '))
      setTimeout(onClose, 1400)
    } catch (err) {
      setError(
        err.actionRequired === 'reconnect'
          ? 'Google access expired — reconnect your Gmail account and try again.'
          : err.message || 'Failed to send'
      )
    }
    setSending(false)
  }

  const frame = maximized
    ? 'inset-4 sm:inset-8'
    : minimized
      ? 'bottom-0 right-4 sm:right-6 w-[92vw] sm:w-[360px]'
      : 'bottom-0 right-4 sm:right-6 w-[92vw] sm:w-[560px] h-[620px] max-h-[85vh]'

  return (
    <div className={`fixed ${frame} z-50 flex flex-col rounded-t-lg ${maximized ? 'rounded-b-lg' : ''} border bg-card shadow-2xl overflow-hidden`}>
      {/* Title bar — click to toggle minimise, like Gmail */}
      <div
        className="flex items-center justify-between gap-2 bg-[#005b5b] text-white px-4 py-2 cursor-pointer shrink-0"
        onClick={() => setMinimized((m) => !m)}
      >
        <span className="text-sm font-medium truncate">
          {sentTo ? 'Message sent' : (subj.trim() || 'New Message')}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button" title={minimized ? 'Expand' : 'Minimise'}
            onClick={(e) => { e.stopPropagation(); setMinimized((m) => !m) }}
            className="size-6 inline-flex items-center justify-center rounded hover:bg-white/15"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button" title={maximized ? 'Restore' : 'Full screen'}
            onClick={(e) => { e.stopPropagation(); setMaximized((m) => !m); setMinimized(false) }}
            className="size-6 inline-flex items-center justify-center rounded hover:bg-white/15"
          >
            {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <button
            type="button" title="Close"
            onClick={(e) => { e.stopPropagation(); discard() }}
            className="size-6 inline-flex items-center justify-center rounded hover:bg-white/15"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!minimized && (
        sentTo ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
            <span className="inline-flex items-center justify-center size-12 rounded-full bg-emerald-600 shadow-sm">
              <Check className="size-6 text-white" />
            </span>
            <div>
              <p className="font-semibold">Sent</p>
              <p className="text-sm text-muted-foreground break-all">to {sentTo}</p>
            </div>
          </div>
        ) : !connected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Connect your Foundry Gmail to send — replies come back to your own inbox.
            </p>
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <><Loader2 className="size-4 mr-1 animate-spin" /> Opening Google…</> : 'Connect Gmail'}
            </Button>
            {gmailError && <p className="text-xs text-destructive">{gmailError}</p>}
          </div>
        ) : (
          <>
            <div className="shrink-0">
              <RecipientField bare label="To"  value={recipients} onChange={setRecipients} directory={directory} autoFocus={!recipients.length} />
              <RecipientField bare label="Cc"  value={cc}  onChange={setCc}  directory={directory} />
              <RecipientField bare label="Bcc" value={bcc} onChange={setBcc} directory={directory} />
              <div className="border-b px-4 py-2">
                <input
                  value={subj}
                  onChange={(e) => setSubj(e.target.value)}
                  placeholder="Subject"
                  className="w-full bg-transparent text-sm outline-none py-1"
                />
              </div>
            </div>

            <RichTextArea
              value={html}
              onChange={setHtml}
              placeholder="Hi — checking in on the invoices below…"
            />

            {(files.length > 0 || error) && (
              <div className="shrink-0 px-4 py-2 space-y-1.5 border-t max-h-32 overflow-y-auto">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                    <span className="truncate">{f.name} <span className="text-muted-foreground">({fmtBytes(f.size)})</span></span>
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
                {files.length > 0 && (
                  <p className={`text-[11px] ${tooBig ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {fmtBytes(totalBytes)} attached{tooBig ? ' — 10 MB max per email' : ''}
                  </p>
                )}
                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            )}

            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t bg-muted/30">
              <Button size="sm" onClick={send} disabled={!recipients.length || sending || tooBig}>
                {sending
                  ? <><Loader2 className="size-4 mr-1 animate-spin" /> Sending…</>
                  : <><Send className="size-4 mr-1" /> Send</>}
              </Button>

              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
              <button
                type="button" title="Attach files"
                onClick={() => fileInput.current?.click()}
                className="size-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Paperclip className="size-4" />
              </button>

              <select
                value={templateId}
                onChange={(e) => chooseTemplate(e.target.value)}
                title="Insert a template"
                className="h-8 px-2 rounded-md border border-input bg-background text-xs max-w-[150px]"
              >
                {EMAIL_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>

              <div className="ml-auto flex items-center gap-2 min-w-0">
                <span className="text-[11px] text-muted-foreground truncate hidden sm:block" title={fromLabel}>
                  {accountName || fromLabel}
                </span>
                <button
                  type="button" title="Discard draft"
                  onClick={discard}
                  className="size-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </>
        )
      )}
    </div>
  )
}
