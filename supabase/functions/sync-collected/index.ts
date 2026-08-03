// sync-collected — persists a parsed cash-basis "Sales by Customer Detail" report
// into Supabase (collected_periods / collected_lines / collected_review).
//
// The parser runs in the browser (it owns the catalog), so this function is a thin,
// ATOMIC per-period writer: it deletes any prior period with the same label (children
// cascade), then inserts the fresh period + lines + review. Idempotent — re-uploading
// a period replaces it wholesale.
//
// Auth: a valid user JWT (the upload comes from a signed-in user).
// Secrets: the platform SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY only.
// See docs/commission-attribution-spec.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Insert in chunks — a report can carry thousands of lines.
async function insertChunked(supabase: any, table: string, rows: any[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + size))
    if (error) throw new Error(`insert ${table}: ${error.message}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ── Authorize: a signed-in user ──
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  try {
    const body = await req.json()
    const period = body?.period
    const lines = Array.isArray(body?.lines) ? body.lines : []
    const review = Array.isArray(body?.review) ? body.review : []
    if (!period?.label) return json({ error: 'Missing period.label' }, 400)

    // ── Atomic-ish per-period replace: drop the old period (children cascade) ──
    const { error: delErr } = await supabase.from('collected_periods').delete().eq('period_label', period.label)
    if (delErr) throw new Error(`delete prior period: ${delErr.message}`)

    // ── Insert the fresh period, get its id ──
    const { data: per, error: perErr } = await supabase
      .from('collected_periods')
      .insert({
        period_label: period.label,
        period_start: period.start ?? null,
        period_end: period.end ?? null,
        source_file: period.sourceFile ?? null,
        grand_total: period.grandTotal ?? null,
        line_count: lines.length,
        uploaded_by: user.id,
      })
      .select('id')
      .single()
    if (perErr) throw new Error(`insert period: ${perErr.message}`)
    const periodId = per.id

    // ── Lines + review, referencing the new period ──
    await insertChunked(supabase, 'collected_lines', lines.map((l: any) => ({
      period_id: periodId,
      customer: l.customer ?? null,
      invoice: l.invoice ?? null,
      txn_date: l.date ?? null,
      sku: l.sku ?? null,
      description: l.description ?? null,
      brand: l.brand ?? null,
      kind: l.kind ?? 'unmatched',
      paid_amount: l.paidAmount ?? 0,
      season: l.season ?? null,
      // rep_id / commissionable / commission filled by PR #4
    })))

    if (review.length) {
      await insertChunked(supabase, 'collected_review', review.map((r: any) => ({
        period_id: periodId,
        customer: r.customer ?? null,
        invoice: r.invoice ?? null,
        sku: r.sku ?? null,
        description: r.description ?? null,
        paid_amount: r.paidAmount ?? null,
        reason: r.reason ?? 'unmatched_sku',
      })))
    }

    return json({ ok: true, period_id: periodId, lines: lines.length, review: review.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
