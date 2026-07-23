// Accounting ↔ rep connection helpers (Model A: reps own their data, accounting
// gets cross-user read access via an active accounting_connection).
import { supabase } from '@/lib/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callFn(name, body) {
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
  const json = await res.json().catch(() => ({}))
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
  const { data, error } = await supabase
    .from('accounting_connections')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Pending (unused, unexpired) invites the current accounting user has generated.
export async function fetchPendingInvites() {
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

// The shareable link a rep clicks to accept.
export function inviteLink(code) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.repcommish.com'
  return `${origin}/accounting-invite/${code}`
}
