import { supabase } from './supabase'

// Read-only query helpers for brand admin.
// Brand admins see data via cross-user RLS policies on companies, clients, orders, seasons.

export async function fetchBrandConnections() {
  const { data, error } = await supabase
    .from('brand_connections')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchConnectedCompanies(repId) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', repId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchConnectedClients(repId) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', repId)
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchConnectedOrders(repId, companyId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', repId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchConnectedSeasons(repId, companyId) {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('user_id', repId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchConnectedUserDetails(userIds) {
  const { data: { session } } = await supabase.auth.getSession()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  const response = await fetch(`${supabaseUrl}/functions/v1/get-connected-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ userIds }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch users')
  return data.users || {}
}

export async function fetchBrandUploads() {
  const { data, error } = await supabase
    .from('brand_uploads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
