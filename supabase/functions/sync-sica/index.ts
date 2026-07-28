// sync-sica — pulls SICAdex scores, dollars overdue, and retailer identity from
// the SICA API (https://api.sicaweb.org) and upserts them into Supabase.
//
// Callers:
//   • the "Refresh scores" button — invoked with the user's JWT
//   • the monthly pg_cron job     — invoked with the x-sica-cron-secret header
//
// Secrets: SICA_USERNAME, SICA_API_PASSWORD, SICA_CRON_SECRET (optional),
//          plus the platform SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
// See docs/sica-integration-spec.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const sicaUser = Deno.env.get('SICA_USERNAME')!
const sicaPass = Deno.env.get('SICA_API_PASSWORD')!
const cronSecret = Deno.env.get('SICA_CRON_SECRET') // optional

const SICA_BASE = 'https://api.sicaweb.org'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-sica-cron-secret',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// SICAdex is monthly data — key each snapshot to the first of the current month.
function currentMonthStart(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

async function sicaGet(path: string) {
  const res = await fetch(`${SICA_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + btoa(`${sicaUser}:${sicaPass}`),
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SICA ${path} → ${res.status} ${text.slice(0, 300)}`)
  }
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ── Authorize: scheduled cron (shared secret) OR an authenticated user ──
  const cronHeader = req.headers.get('x-sica-cron-secret')
  const isCron = !!cronSecret && cronHeader === cronSecret
  if (!isCron) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)
    const { data: { user }, error } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (error || !user) return json({ error: 'Invalid token' }, 401)
  }

  // countryid: default USA (2). ?countryid=1 for Canada, ?countryid=all for both.
  const url = new URL(req.url)
  const countryParam = url.searchParams.get('countryid') || '2'
  const countryIds = countryParam === 'all' ? [1, 2] : [Number(countryParam)]
  const asOf = currentMonthStart()
  const now = new Date().toISOString()

  // Open a sync-log row so a hung/failed run is visible.
  const { data: logRow } = await supabase
    .from('sica_sync_log')
    .insert({ status: 'running' })
    .select('id')
    .single()
  const logId = logRow?.id

  try {
    let retailerCount = 0
    let scoreCount = 0

    for (const cid of countryIds) {
      const q = `?countryid=${cid}`
      const [general, sicadex, overdue] = await Promise.all([
        sicaGet(`/retailers/general/current${q}`),
        sicaGet(`/retailers/sicadex/current${q}`),
        sicaGet(`/retailers/dollars-overdue/current${q}`),
      ])

      // Retailers (identity + join key) ─────────────────────────────────────
      const retailers = (general?.retailersInfo || []).map((r: any) => ({
        retailer_id: r.retailerID,
        sica_account_number: r.accountNumber ?? null,
        member_account_number: r.memberAccountNumber ?? null,
        legal_name: r.legalName ?? null,
        dba: r.dbA1 ?? null,
        city: r.city ?? null,
        province_code: r.provinceCode ?? null,
        country_id: cid,
        updated_at: now,
      }))
      if (retailers.length) {
        const { error } = await supabase
          .from('sica_retailers')
          .upsert(retailers, { onConflict: 'retailer_id' })
        if (error) throw new Error(`upsert sica_retailers: ${error.message}`)
        retailerCount += retailers.length
      }

      // SICAdex scores ──────────────────────────────────────────────────────
      const scores = (sicadex?.retailerSicadexBos || []).map((s: any) => ({
        retailer_id: s.retailerID,
        period: 'current',
        as_of: asOf,
        sicadex_cm: s.sicadexCM ?? null,
        sicadex_avg_12mth: s.sicadexAvg12mth ?? null,
        sicadex_variance_smly: s.sicadexVarianceSMLY ?? null,
        sicadex_variance_pct: s.sicadexVariancePercentage ?? null,
        sicadex_comparative: s.sicadexComparativeRetailers ?? null,
        synced_at: now,
      }))
      if (scores.length) {
        const { error } = await supabase
          .from('sica_scores')
          .upsert(scores, { onConflict: 'retailer_id,period,as_of' })
        if (error) throw new Error(`upsert sica_scores: ${error.message}`)
        scoreCount += scores.length
      }

      // Dollars overdue / high credit ───────────────────────────────────────
      const overdues = (overdue?.retailerOverdueBos || []).map((o: any) => ({
        retailer_id: o.retailerID,
        as_of: asOf,
        total_os: o.totalOS ?? null,
        overdue_cm: o.overdueCM ?? null,
        overdue_smly: o.overdueSMLY ?? null,
        overdue_var_pct: o.overduePercentageVarianceSMLY ?? null,
        my_co_high_credit: o.myCoHighCredit ?? null,
        member_count: o.memberCount ?? null,
        synced_at: now,
      }))
      if (overdues.length) {
        const { error } = await supabase
          .from('sica_overdue')
          .upsert(overdues, { onConflict: 'retailer_id,as_of' })
        if (error) throw new Error(`upsert sica_overdue: ${error.message}`)
      }
    }

    if (logId) {
      await supabase
        .from('sica_sync_log')
        .update({
          status: 'ok',
          finished_at: new Date().toISOString(),
          retailers_count: retailerCount,
          scores_count: scoreCount,
        })
        .eq('id', logId)
    }
    return json({ ok: true, retailers: retailerCount, scores: scoreCount, as_of: asOf })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (logId) {
      await supabase
        .from('sica_sync_log')
        .update({ status: 'error', finished_at: new Date().toISOString(), message })
        .eq('id', logId)
    }
    return json({ error: message }, 500)
  }
})
