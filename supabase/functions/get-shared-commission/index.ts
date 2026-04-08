import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { token } = await req.json()

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the share record (service role bypasses RLS)
    const { data: share, error: shareError } = await supabase
      .from('commission_shares')
      .select('*')
      .eq('share_token', token)
      .single()

    if (shareError || !share) {
      return new Response(JSON.stringify({ error: 'Share link not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate: not revoked
    if (share.revoked) {
      return new Response(JSON.stringify({ error: 'This share link has been revoked' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate: not expired
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This share link has expired' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { user_id, company_id, season_id } = share

    // Fetch company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('name, commission_percent, category_commissions, logo_path')
      .eq('id', company_id)
      .eq('user_id', user_id)
      .single()

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch seasons (non-archived) for this user + company
    // If season_id is set, still fetch all so viewer knows context, but we filter orders below
    const { data: seasons } = await supabase
      .from('seasons')
      .select('*')
      .eq('user_id', user_id)
      .eq('company_id', company_id)
      .eq('archived', false)
      .order('created_at', { ascending: false })

    const pageSize = 1000

    // Fetch ALL orders — paginate past 1000-row limit
    let orders: any[] = []
    let ordersFrom = 0
    while (true) {
      let q = supabase
        .from('orders')
        .select('*')
        .eq('user_id', user_id)
        .eq('company_id', company_id)
        .range(ordersFrom, ordersFrom + pageSize - 1)
      if (season_id) q = q.eq('season_id', season_id)
      const { data: page } = await q
      if (!page || page.length === 0) break
      orders = orders.concat(page)
      if (page.length < pageSize) break
      ordersFrom += pageSize
    }

    // Fetch commissions for those orders
    const orderIds = (orders || []).map((o: { id: string }) => o.id)
    let commissions: unknown[] = []

    if (orderIds.length > 0) {
      const { data: commissionsData } = await supabase
        .from('commissions')
        .select('*')
        .in('order_id', orderIds)

      commissions = commissionsData || []
    }

    // Fetch ALL accounts (clients) for this user — paginate past 1000-row limit
    let accounts: { id: number; name: string; currency: string }[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('clients')
        .select('id, name, currency')
        .eq('user_id', user_id)
        .range(from, from + pageSize - 1)
      if (!page || page.length === 0) break
      accounts = accounts.concat(page)
      if (page.length < pageSize) break
      from += pageSize
    }

    return new Response(JSON.stringify({
      company,
      seasons: seasons || [],
      orders: orders || [],
      commissions,
      accounts: accounts || [],
      shareLabel: share.label,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
