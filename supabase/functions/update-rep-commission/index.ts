import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Who may override a rep's commission. 'accounting' additionally requires an
// active, sharing-enabled connection to the specific rep (checked below);
// master_admin/admin are superusers and exempt from the connection check.
const ALLOWED_ROLES = ['accounting', 'master_admin', 'admin']

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
      return json({ error: 'Forbidden — accounting access required' }, 403)
    }

    // ── Payload ──────────────────────────────────────────────────────
    // commissionPct: a number 0–100 to set an override, or null to clear it
    // (reverting the sale to its brand/category default rate).
    const { orderId, commissionPct } = await req.json()
    if (orderId == null) return json({ error: 'orderId is required' }, 400)

    let pct: number | null = commissionPct
    if (pct !== null) {
      pct = Number(pct)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return json({ error: 'commissionPct must be a number 0–100, or null to reset' }, 400)
      }
    }

    // ── Load the order (its owner is the rep) ────────────────────────
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('id, user_id, total, order_type, company_id, commission_override')
      .eq('id', orderId)
      .single()
    if (oErr || !order) return json({ error: 'Order not found' }, 404)

    // ── Connection gate: accounting must be linked to this rep ───────
    if (role === 'accounting') {
      const { data: conn } = await supabase
        .from('accounting_connections')
        .select('id')
        .eq('accounting_id', caller.id)
        .eq('rep_id', order.user_id)
        .eq('status', 'active')
        .eq('sharing_enabled', true)
        .maybeSingle()
      if (!conn) return json({ error: 'No active connection to this rep' }, 403)
    }

    // ── Write the override onto the order ────────────────────────────
    const { data: updatedOrder, error: uErr } = await supabase
      .from('orders')
      .update({ commission_override: pct })
      .eq('id', orderId)
      .select()
      .single()
    if (uErr) return json({ error: uErr.message }, 500)

    // Effective rate: the override, or the brand's category/default rate when cleared.
    let effRate = pct
    if (effRate === null) {
      const { data: company } = await supabase
        .from('companies')
        .select('commission_percent, category_commissions')
        .eq('id', order.company_id)
        .maybeSingle()
      const catPct = company?.category_commissions?.[order.order_type]
      effRate = catPct != null ? Number(catPct) : Number(company?.commission_percent || 0)
    }

    // ── Recompute the payout row if one already exists ───────────────
    // (commissions rows are created when payments are tracked; if none exists
    // yet the rate lives on the order and is applied when one is created.)
    let updatedCommission = null
    const { data: comm } = await supabase
      .from('commissions')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle()
    if (comm) {
      const commission_due = Number(order.total || 0) * Number(effRate) / 100
      const amount_remaining = Math.max(commission_due - Number(comm.amount_paid || 0), 0)
      const { data: uc, error: cErr } = await supabase
        .from('commissions')
        .update({ commission_due, amount_remaining })
        .eq('order_id', orderId)
        .select()
        .single()
      if (cErr) return json({ error: cErr.message }, 500)
      updatedCommission = uc
    }

    return json({ success: true, order: updatedOrder, commission: updatedCommission })
  } catch (err) {
    console.error('update-rep-commission error:', err)
    return json({ error: (err as Error).message || 'Unexpected error' }, 500)
  }
})
