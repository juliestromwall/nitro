// Drop an invoice PDF onto a connected rep's sale.
//
// Accounting can only READ a connected rep's rows (see
// accounting-connection-migration.sql), and the storage policy only lets you
// write into your OWN folder — so neither the table update nor the upload can
// happen from the browser as an accounting user. This runs with the service
// role and re-checks the connection server-side, exactly like
// update-rep-commission does for commission edits.
//
// POST { repId, items: [{ orderId, invoiceNumber?, fileName, fileBase64 }] }
//   → { results: [{ orderId, ok, error?, document? }] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// base64 → bytes, chunked so a large PDF doesn't blow the call stack the way
// String.fromCharCode(...bytes) does.
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return json({ error: 'Invalid token' }, 401)

    const role = user.app_metadata?.role
    const isSuper = role === 'master_admin' || role === 'admin'
    if (role !== 'accounting' && !isSuper) {
      return json({ error: 'Only accounting can drop invoices' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const repId: string = body?.repId
    const items: Array<Record<string, unknown>> = Array.isArray(body?.items) ? body.items : []
    if (!repId) return json({ error: 'repId is required' }, 400)
    if (!items.length) return json({ error: 'No files supplied' }, 400)

    // The connection must still be active — revoking a rep must also stop
    // invoices being pushed at them. Superusers bypass, as elsewhere.
    if (!isSuper) {
      const { data: conn } = await supabase
        .from('accounting_connections')
        .select('id')
        .eq('accounting_id', user.id)
        .eq('rep_id', repId)
        .eq('status', 'active')
        .eq('sharing_enabled', true)
        .maybeSingle()
      if (!conn) return json({ error: 'No active connection to this rep' }, 403)
    }

    const results: Array<Record<string, unknown>> = []

    for (const raw of items) {
      const orderId = raw?.orderId
      const fileBase64 = String(raw?.fileBase64 || '')
      const fileName = String(raw?.fileName || 'invoice.pdf')
      const invoiceNumber = raw?.invoiceNumber ? String(raw.invoiceNumber) : null

      try {
        if (!orderId || !fileBase64) throw new Error('orderId and fileBase64 are required')

        // The order must actually belong to this rep — never let a bad id in the
        // payload write into someone else's book.
        const { data: order, error: oErr } = await supabase
          .from('orders')
          .select('id,user_id,order_number')
          .eq('id', orderId)
          .maybeSingle()
        if (oErr) throw new Error(oErr.message)
        if (!order) throw new Error('Order not found')
        if (order.user_id !== repId) throw new Error('Order does not belong to this rep')

        // Same folder convention the app uses, so the rep's own signed-URL
        // reads work unchanged: documents/<repUserId>/<orderId>/invoice/<ts>.pdf
        const key = `${repId}/${orderId}/invoice/${Date.now()}.pdf`
        const { data: up, error: upErr } = await supabase.storage
          .from('documents')
          .upload(key, b64ToBytes(fileBase64), { contentType: 'application/pdf', upsert: false })
        if (upErr) throw new Error('upload: ' + upErr.message)

        const document = { name: fileName, path: up.path }
        const patch: Record<string, unknown> = { invoice_document: document }
        if (invoiceNumber) patch.invoice_number = invoiceNumber

        const { error: updErr } = await supabase.from('orders').update(patch).eq('id', orderId)
        if (updErr) throw new Error('order update: ' + updErr.message)

        results.push({ orderId, orderNumber: order.order_number, ok: true, document })
      } catch (e) {
        results.push({ orderId, ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return json({ results })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
