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

    // Verify caller via JWT — this is the REP accepting the invite.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { inviteCode } = await req.json()

    if (!inviteCode) {
      return new Response(JSON.stringify({ error: 'Missing inviteCode' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the invite
    const { data: invite, error: inviteError } = await supabase
      .from('accounting_invites')
      .select('*')
      .eq('invite_code', inviteCode)
      .single()

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: 'Invalid invite code' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (invite.used) {
      return new Response(JSON.stringify({ error: 'Invite already used' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invite expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Don't allow accounting to accept its own invite
    if (invite.accounting_id === user.id) {
      return new Response(JSON.stringify({ error: 'Cannot accept your own invite' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check for existing connection
    const { data: existing } = await supabase
      .from('accounting_connections')
      .select('id, status')
      .eq('accounting_id', invite.accounting_id)
      .eq('rep_id', user.id)
      .maybeSingle()

    if (existing) {
      // Re-activate a previously revoked connection rather than erroring.
      if (existing.status === 'revoked') {
        await supabase
          .from('accounting_connections')
          .update({ status: 'active', sharing_enabled: true, accepted_at: new Date().toISOString(), invite_code: inviteCode })
          .eq('id', existing.id)
        await supabase
          .from('accounting_invites')
          .update({ used: true, used_by: user.id })
          .eq('id', invite.id)
        return new Response(JSON.stringify({ success: true, reactivated: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'Connection already exists' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create the connection (accounting → this rep)
    const { error: connectionError } = await supabase
      .from('accounting_connections')
      .insert({
        accounting_id: invite.accounting_id,
        rep_id: user.id,
        invite_code: inviteCode,
        status: 'active',
        sharing_enabled: true,
        accepted_at: new Date().toISOString(),
      })

    if (connectionError) {
      return new Response(JSON.stringify({ error: 'Failed to create connection' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark invite as used
    await supabase
      .from('accounting_invites')
      .update({ used: true, used_by: user.id })
      .eq('id', invite.id)

    // NOTE: unlike the brand-admin flow, we intentionally do NOT change the
    // rep's role or plan here. The accepter is a paying rep and keeps their
    // existing role (pro_rep / rep / etc.).

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
