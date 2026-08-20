// Gmail sender via Google Workspace domain-wide delegation (DWD).
//
// Lets RepCommish send email AS a @foundrydist.com Workspace user through a
// service account that a Workspace super-admin has authorized for the
// `gmail.send` scope (Admin console → Security → API controls →
// Domain-wide delegation). No per-user OAuth, refresh tokens, or consent
// screens — the send-as identity is chosen server-side.
//
// Requires the GMAIL_SERVICE_ACCOUNT secret: the full service-account JSON key
// (as downloaded from Google Cloud), stored verbatim as a Supabase secret.

interface ServiceAccount {
  client_email: string
  private_key: string
}

export interface GmailAttachment {
  filename: string
  type: string
  contentBase64: string // already base64-encoded file bytes
}

export interface GmailMessage {
  from: string // MUST be the impersonated Workspace user (or a verified alias)
  fromName?: string
  to: string
  toName?: string
  replyTo?: string
  subject: string
  html: string
  attachments?: GmailAttachment[]
}

const bytesToB64 = (bytes: Uint8Array): string => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

const b64url = (bytes: Uint8Array): string =>
  bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const b64urlStr = (s: string): string => b64url(new TextEncoder().encode(s))

// Wrap base64 to 76-char lines per RFC 2045 (strict MIME parsers require it).
const wrap76 = (s: string): string => s.replace(/.{76}/g, '$&\r\n')

// RFC 2047 encode a header value only when it contains non-ASCII characters.
const encodeHeader = (s: string): string =>
  /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${bytesToB64(new TextEncoder().encode(s))}?=`

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// Mint a short-lived Gmail access token, impersonating `subject` via DWD.
async function getAccessToken(sa: ServiceAccount, subject: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64urlStr(
    JSON.stringify({
      iss: sa.client_email,
      sub: subject,
      scope: 'https://www.googleapis.com/auth/gmail.send',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const unsigned = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  )
  const assertion = `${unsigned}.${b64url(sig)}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!resp.ok) {
    throw new Error(`Google token exchange failed (${resp.status}): ${await resp.text()}`)
  }
  const { access_token } = await resp.json()
  if (!access_token) throw new Error('Google token response had no access_token')
  return access_token
}

function buildRawMessage(msg: GmailMessage): string {
  const boundary = `rc_${b64url(crypto.getRandomValues(new Uint8Array(12)))}`
  const from = msg.fromName ? `${encodeHeader(msg.fromName)} <${msg.from}>` : msg.from
  const to = msg.toName ? `${encodeHeader(msg.toName)} <${msg.to}>` : msg.to
  const lines: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    ...(msg.replyTo ? [`Reply-To: ${msg.replyTo}`] : []),
    `Subject: ${encodeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(bytesToB64(new TextEncoder().encode(msg.html))),
  ]
  for (const att of msg.attachments ?? []) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.type}; name="${att.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${att.filename}"`,
      '',
      wrap76(att.contentBase64),
    )
  }
  lines.push(`--${boundary}--`, '')
  return lines.join('\r\n')
}

// True when DWD sending is configured (secret present). Callers use this to
// decide whether to attempt Gmail before falling back to another provider.
export function gmailDwdConfigured(): boolean {
  return !!Deno.env.get('GMAIL_SERVICE_ACCOUNT')
}

// Send `msg` as `msg.from` via Gmail domain-wide delegation.
// Throws on any failure so the caller can fall back to another provider.
export async function sendViaGmail(msg: GmailMessage): Promise<void> {
  const raw = Deno.env.get('GMAIL_SERVICE_ACCOUNT')
  if (!raw) throw new Error('GMAIL_SERVICE_ACCOUNT secret is not set')
  let sa: ServiceAccount
  try {
    sa = JSON.parse(raw)
  } catch {
    throw new Error('GMAIL_SERVICE_ACCOUNT is not valid JSON')
  }

  const token = await getAccessToken(sa, msg.from)
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(new TextEncoder().encode(buildRawMessage(msg))) }),
  })
  if (!resp.ok) {
    throw new Error(`Gmail send failed (${resp.status}): ${await resp.text()}`)
  }
}
