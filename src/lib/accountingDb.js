// Accounting ↔ rep connection helpers (Model A: reps own their data, accounting
// gets cross-user read access via an active accounting_connection).
import { supabase } from '@/lib/supabase'
import { ensureFreshSession } from '@/lib/db'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callFn(name, body) {
  // Refresh an expiring token first. Without this the edge function rejects a
  // stale JWT with "Invalid token" — which is what made connected reps look
  // like they'd vanished.
  await ensureFreshSession()
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body ?? {}),
  })
  let json = await res.json().catch(() => ({}))

  // A 401 here means the JWT we sent was rejected. Try one forced refresh —
  // ensureFreshSession only acts when the token is near expiry, and says
  // nothing when the refresh itself fails — then retry once.
  if (res.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    const newToken = refreshed?.session?.access_token
    if (newToken) {
      const retry = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
          apikey: anonKey,
        },
        body: JSON.stringify(body ?? {}),
      })
      json = await retry.json().catch(() => ({}))
      if (retry.ok) return json
    }
    throw new Error('Your session has expired — please sign out and sign in again.')
  }

  if (!res.ok) throw new Error(json.error || `${name} failed`)
  return json
}

// Accounting generates a shareable invite for a rep. Returns the invite row
// (with invite_code). repEmail is optional and display-only.
export async function createRepInvite(repEmail) {
  const { invite } = await callFn('create-accounting-invite', { repEmail })
  return invite
}

// All connections for the current accounting user (RLS scopes to own rows).
export async function fetchConnections() {
  await ensureFreshSession()
  const { data, error } = await supabase
    .from('accounting_connections')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Pending (unused, unexpired) invites the current accounting user has generated.
export async function fetchPendingInvites() {
  await ensureFreshSession()
  const { data, error } = await supabase
    .from('accounting_invites')
    .select('*')
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Resolve rep display info (name/email/avatar) for a set of rep user IDs.
export async function fetchRepDetails(repIds) {
  if (!repIds?.length) return {}
  const { users } = await callFn('get-connected-users', { userIds: repIds })
  return users ?? {}
}

// Revoke (soft) a connection — accounting can update its own rows via RLS.
export async function revokeConnection(id) {
  const { error } = await supabase
    .from('accounting_connections')
    .update({ status: 'revoked' })
    .eq('id', id)
  if (error) throw error
}

// A connected rep's sales data (orders + the lookups needed to display and
// price them). RLS grants accounting SELECT on a connected rep's rows; we
// scope to the rep's user_id so we don't pull in the accounting user's own.
export async function fetchRepSales(repId) {
  const q = (table) => supabase.from(table).select('*').eq('user_id', repId)
  const [orders, companies, clients, seasons, commissions] = await Promise.all([
    q('orders'), q('companies'), q('clients'), q('seasons'), q('commissions'),
  ])
  for (const r of [orders, companies, clients, seasons, commissions]) {
    if (r.error) throw r.error
  }
  return {
    orders: orders.data ?? [],
    companies: companies.data ?? [],
    clients: clients.data ?? [],
    seasons: seasons.data ?? [],
    commissions: commissions.data ?? [],
  }
}

// Override (or reset, with pct = null) the commission % on a connected rep's
// sale. Goes through an edge function that re-checks the connection server-side.
export async function updateRepCommission(orderId, commissionPct) {
  return callFn('update-rep-commission', { orderId, commissionPct })
}

// Drop invoice PDFs onto a connected rep's sales.
//
// Goes through an edge function because accounting has SELECT-only access to a
// rep's orders, and storage only allows writing into your own folder — neither
// the update nor the upload is possible from the browser as accounting.
// items: [{ orderId, invoiceNumber?, fileName, fileBase64 }]
export async function dropRepInvoices(repId, items) {
  return callFn('drop-rep-invoice', { repId, items })
}

// The shareable link a rep clicks to accept.
export function inviteLink(code) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.repcommish.com'
  return `${origin}/accounting-invite/${code}`
}
