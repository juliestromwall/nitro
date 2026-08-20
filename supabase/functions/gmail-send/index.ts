// Sends mail as the signed-in user's connected Gmail account, and reports the
// identity/signature Gmail would use.
//
// POST { action: 'send', to, subject, body, cc?, bcc?, attachments? }
// POST { action: 'sendas' }  ->  { displayName, sendAsEmail, signature }
//
// Unlike a browser-side Gmail client, the OAuth access token never leaves the
// server: the client asks for a send, this function performs it. An XSS in the
// app therefore can't walk away with a token carrying gmail.modify scope.

import {
  corsHeaders, json, userFromRequest, getAccessToken, tokenErrorResponse,
} from '../_shared/googleOAuth.ts'

interface Attachment {
  filename: string
  mimeType: string
  base64Data: string
}

const CHUNK = 0x8000

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** RFC 2047 encoded-word, only when the value actually needs it. */
const encodeWord = (s: string) =>
  /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`

function fromHeader(displayName: string, email: string): string {
  if (!email) return ''
  if (!displayName) return `From: ${email}`
  const name = /^[\x20-\x7E]*$/.test(displayName)
    ? `"${displayName.replace(/"/g, '\\"')}"`
    : encodeWord(displayName)
  return `From: ${name} <${email}>`
}

function buildMime(opts: {
  fromName: string; fromEmail: string
  to: string; cc?: string; bcc?: string
  subject: string; html: string
  attachments: Attachment[]
}): string {
  const boundary = `repcommish_${crypto.randomUUID()}`
  const lines: string[] = [
    fromHeader(opts.fromName, opts.fromEmail),
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : '',
    opts.bcc ? `Bcc: ${opts.bcc}` : '',
    `Subject: ${encodeWord(opts.subject || '')}`,
    'MIME-Version: 1.0',
  ].filter(Boolean)

  if (opts.attachments.length > 0) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '')
    lines.push(`--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', '', opts.html)
    for (const att of opts.attachments) {
      lines.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType || 'application/octet-stream'}; name="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${att.filename}"`,
        '',
        // RFC 2045 wants base64 wrapped at 76 chars; strict parsers reject long lines.
        att.base64Data.replace(/.{76}/g, '$&\r\n'),
      )
    }
    lines.push(`--${boundary}--`)
  } else {
    lines.push('Content-Type: text/html; charset="UTF-8"', '', opts.html)
  }

  return b64(lines.join('\r\n'))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sendAsIdentity(token: string) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { displayName: '', sendAsEmail: '', signature: '' }
  const data = await res.json()
  const primary = (data.sendAs || []).find((s: { isPrimary?: boolean }) => s.isPrimary) || {}
  return {
    displayName: primary.displayName || '',
    sendAsEmail: primary.sendAsEmail || '',
    signature: primary.signature || '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await userFromRequest(req)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }
  const action = (body.action as string) || 'send'

  let token: string
  try {
    ({ token } = await getAccessToken(user.id))
  } catch (err) {
    return tokenErrorResponse(err)
  }

  if (action === 'sendas') {
    return json(await sendAsIdentity(token))
  }

  const to = String(body.to || '').trim()
  if (!to) return json({ error: 'At least one recipient is required' }, 400)

  const identity = await sendAsIdentity(token)
  const attachments = Array.isArray(body.attachments) ? (body.attachments as Attachment[]) : []

  // Gmail's API does not append the account signature (that's a web-UI-only
  // behaviour), so it goes in explicitly when the caller asks for it.
  const html = String(body.body || '')
  const withSignature = body.include_signature && identity.signature
    ? `${html}<br><div>--</div>${identity.signature}`
    : html

  const raw = buildMime({
    fromName: String(body.from_name || identity.displayName || ''),
    fromEmail: identity.sendAsEmail || String(user.email || ''),
    to,
    cc: body.cc ? String(body.cc) : undefined,
    bcc: body.bcc ? String(body.bcc) : undefined,
    subject: String(body.subject || ''),
    html: withSignature,
    attachments,
  })

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  const data = await res.json()

  if (!res.ok) {
    return json({ error: data.error?.message || 'Gmail rejected the message' }, res.status)
  }

  return json({ id: data.id, threadId: data.threadId, sent_as: identity.sendAsEmail })
})
