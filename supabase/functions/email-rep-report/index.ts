import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Roles permitted to email a rep their commission report. Keeps this from
// being an open email relay — only signed-in portal admins can trigger a send.
const ALLOWED_ROLES = ['master_admin', 'admin', 'brand_admin', 'manager']

const FROM_EMAIL = 'accounting@foundrydist.com'
const FROM_NAME = 'Foundry Distribution'
const REPLY_TO = 'accounting@foundrydist.com'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ── Auth: valid JWT + allowed role ───────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !caller) return json({ error: 'Invalid token' }, 401)

    const { data: { user: callerFull } } = await supabase.auth.admin.getUserById(caller.id)
    const role = callerFull?.app_metadata?.role
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return json({ error: 'Forbidden — admin access required' }, 403)
    }

    // ── Payload ──────────────────────────────────────────────────────
    const {
      repName, repEmail, subject, message,
      pdfBase64, pdfFilename, xlsxBase64, xlsxFilename,
    } = await req.json()

    if (!repEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(repEmail)) {
      return json({ error: 'A valid recipient email is required.' }, 400)
    }
    if (!pdfBase64 && !xlsxBase64) {
      return json({ error: 'No report attachments provided.' }, 400)
    }

    const attachments: Array<Record<string, string>> = []
    if (pdfBase64) {
      attachments.push({
        content: pdfBase64,
        filename: pdfFilename || 'commission-report.pdf',
        type: 'application/pdf',
        disposition: 'attachment',
      })
    }
    if (xlsxBase64) {
      attachments.push({
        content: xlsxBase64,
        filename: xlsxFilename || 'commission-report.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: 'attachment',
      })
    }

    // Plain-text message → simple branded HTML (preserve line breaks).
    const safeMessage = String(message || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; color: #18181b;">
        <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${safeMessage}</div>
        <hr style="margin: 24px 0 12px; border: none; border-top: 1px solid #e4e4e7;" />
        <p style="font-size: 12px; color: #a1a1aa;">Foundry Distribution • Commission report attached (PDF + Excel).</p>
      </div>`

    const sg = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: repEmail, name: repName || undefined }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        reply_to: { email: REPLY_TO },
        subject: subject || 'Your commission report',
        content: [{ type: 'text/html', value: html }],
        attachments,
      }),
    })

    if (!sg.ok) {
      const errText = await sg.text()
      console.error('SendGrid error:', sg.status, errText)
      return json({ error: `Email provider rejected the message (${sg.status}).` }, 502)
    }

    return json({ success: true })
  } catch (err) {
    console.error('email-rep-report error:', err)
    return json({ error: (err as Error).message || 'Unexpected error' }, 500)
  }
})
