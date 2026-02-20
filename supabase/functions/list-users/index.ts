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

    // Verify caller is master_admin via their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check caller's role via admin API
    const { data: { user: callerFull }, error: callerError } = await supabase.auth.admin.getUserById(caller.id)

    if (callerError || callerFull?.app_metadata?.role !== 'master_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden — master_admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch all users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })

    if (listError) {
      return new Response(JSON.stringify({ error: 'Failed to list users' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Return safe subset
    const safeUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      first_name: u.user_metadata?.first_name || '',
      last_name: u.user_metadata?.last_name || '',
      avatar_url: u.user_metadata?.avatar_url || null,
      role: u.app_metadata?.role || 'rep',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }))

    return new Response(JSON.stringify({ users: safeUsers }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
