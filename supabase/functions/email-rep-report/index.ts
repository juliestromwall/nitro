// email-rep-report — emails a rep their commission report (PDF + Excel) as
// accounting@foundrydist.com, via the Gmail API using a Google service account
// with domain-wide delegation (no third-party email provider).
//
// Setup (Google Workspace):
//   1. A service account with a JSON key.
//   2. Admin → Security → API Controls → Domain-wide Delegation: add the service
//      account's Client ID with scope https://www.googleapis.com/auth/gmail.send
//   3. The function impersonates FROM_EMAIL (must be a real Workspace mailbox).
//
// Secrets: GOOGLE_SERVICE_ACCOUNT_JSON (the full service-account key file, pasted
//          as-is), plus the platform SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Roles permitted to email a rep their commission report — keeps this from being
// an open relay; only signed-in portal admins can trigger a send.
const ALLOWED_ROLES = ['master_admin', 'admin', 'brand_admin', 'manager']

const FROM_EMAIL = 'accounting@foundrydist.com'
const FROM_NAME = 'Foundry Distribution'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ── base64 helpers ──────────────────────────────────────────────────────
function b64(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin)
}
const b64url = (input: Uint8Array | string): string =>
  b64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(body)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// Mint a Google OAuth access token for the service account, impersonating `subject`.
async function getAccessToken(sa: { client_email: string; private_key: string }, subject: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: GMAIL_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    sub: subject,
    iat: now,
    exp: now + 3600,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const jwt = `${signingInput}.${b64url(new Uint8Array(sig))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Google token exchange failed (${res.status}): ${t.slice(0, 300)}`)
  }
  const tok = await res.json()
  if (!tok.access_token) throw new Error('Google returned no access token.')
  return tok.access_token as string
}

// Build an RFC 5322 multipart/mixed message (base64 body + base64 attachments).
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd()
const cleanHeader = (s: string) => String(s || '').replace(/[\r\n]+/g, ' ').trim()

function buildRaw(opts: {
  toEmail: string; toName?: string; subject: string; html: string;
  attachments: Array<{ content: string; filename: string; type: string }>;
}): string {
  const boundary = `=_foundry_${Date.now()}_${Math.floor(Math.random() * 1e9)}`
  const p: string[] = []
  p.push(`From: "${FROM_NAME}" <${FROM_EMAIL}>`)
  p.push(`To: ${opts.toName ? `"${cleanHeader(opts.toName)}" ` : ''}<${opts.toEmail}>`)
  p.push(`Subject: ${cleanHeader(opts.subject)}`)
  p.push('MIME-Version: 1.0')
  p.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
  p.push('')
  p.push(`--${boundary}`)
  p.push('Content-Type: text/html; charset="UTF-8"')
  p.push('Content-Transfer-Encoding: base64')
  p.push('')
  p.push(wrap76(b64(opts.html)))
  for (const a of opts.attachments) {
    p.push(`--${boundary}`)
    p.push(`Content-Type: ${a.type}; name="${a.filename}"`)
    p.push('Content-Transfer-Encoding: base64')
    p.push(`Content-Disposition: attachment; filename="${a.filename}"`)
    p.push('')
    p.push(wrap76(a.content))
  }
  p.push(`--${boundary}--`)
  return p.join('\r\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ── Auth: valid JWT + allowed role ───────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !caller) return json({ error: 'Invalid token' }, 401)

    const { data: { user: callerFull } } = await supabase.auth.admin.getUserById(caller.id)
    const role = callerFull?.app_metadata?.role
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return json({ error: 'Forbidden — admin access required' }, 403)
    }

    // ── Payload ──────────────────────────────────────────────────────
    const { repName, repEmail, subject, message, pdfBase64, pdfFilename, xlsxBase64, xlsxFilename } = await req.json()
    if (!repEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(repEmail)) {
      return json({ error: 'A valid recipient email is required.' }, 400)
    }
    if (!pdfBase64 && !xlsxBase64) {
      return json({ error: 'No report attachments provided.' }, 400)
    }

    // ── Google service account ───────────────────────────────────────
    const saRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!saRaw) return json({ error: 'Email is not configured (missing Google service account key).' }, 500)
    let sa: { client_email: string; private_key: string }
    try { sa = JSON.parse(saRaw) } catch { return json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.' }, 500) }
    if (!sa.client_email || !sa.private_key) {
      return json({ error: 'Service account key is missing client_email / private_key.' }, 500)
    }

    // ── Compose + send via Gmail ─────────────────────────────────────
    const safeMessage = String(message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; color: #18181b;">
        <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${safeMessage}</div>
        <hr style="margin: 24px 0 12px; border: none; border-top: 1px solid #e4e4e7;" />
        <p style="font-size: 12px; color: #a1a1aa;">Foundry Distribution • Commission report attached (PDF + Excel).</p>
      </div>`

    const attachments: Array<{ content: string; filename: string; type: string }> = []
    if (pdfBase64) attachments.push({ content: pdfBase64, filename: pdfFilename || 'commission-report.pdf', type: 'application/pdf' })
    if (xlsxBase64) attachments.push({ content: xlsxBase64, filename: xlsxFilename || 'commission-report.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    const accessToken = await getAccessToken(sa, FROM_EMAIL)
    const raw = buildRaw({ toEmail: repEmail, toName: repName, subject: subject || 'Your commission report', html, attachments })

    const gmailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(FROM_EMAIL)}/messages/send`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(raw) }) },
    )
    if (!gmailRes.ok) {
      const errText = await gmailRes.text()
      console.error('Gmail send error:', gmailRes.status, errText)
      return json({ error: `Gmail rejected the message (${gmailRes.status}). ${errText.slice(0, 200)}` }, 502)
    }

    return json({ success: true })
  } catch (err) {
    console.error('email-rep-report error:', err)
    return json({ error: (err as Error).message || 'Unexpected error' }, 500)
  }
})
