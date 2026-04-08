import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { error } = await supabase.rpc('exec_sql', { sql: '' }).maybeSingle()

  // Use raw SQL via the REST API isn't available, so use the admin client
  const { data, error: err } = await supabase.from('commission_shares').select('id').limit(1)

  if (err?.code === '42P01') {
    // Table doesn't exist, create it
    // We can't run DDL through the client, output the SQL instead
    return new Response(JSON.stringify({
      message: 'Table does not exist. Run the following SQL in Supabase Dashboard > SQL Editor:',
      sql: `
create table commission_shares (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) not null,
  company_id bigint not null,
  season_id text,
  share_token text not null unique,
  label text,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table commission_shares enable row level security;

create policy "Users can view own shares"
  on commission_shares for select using (auth.uid() = user_id);
create policy "Users can create shares"
  on commission_shares for insert with check (auth.uid() = user_id);
create policy "Users can update own shares"
  on commission_shares for update using (auth.uid() = user_id);
      `,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ message: 'Table already exists', data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
