// Commission payout requests — rep asks their connected accounting user to pay
// out commission; accounting approves (possibly for less), rejects, or marks paid.
//
// Both sides read the same table; RLS decides which rows each one sees, so these
// helpers are shared rather than split by role.
import { supabase } from '@/lib/supabase'

export const PAYOUT_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'red' },
  paid: { label: 'Paid', tone: 'teal' },
  cancelled: { label: 'Withdrawn', tone: 'zinc' },
}

// ── Rep side ────────────────────────────────────────────────────────

// The accounting users this rep is actively connected to. A rep with none of
// these has nobody to request from — the UI uses that to explain why.
export async function fetchMyAccountants() {
  const { data, error } = await supabase
    .from('accounting_connections')
    .select('id, accounting_id, status, sharing_enabled')
    .eq('status', 'active')
    .eq('sharing_enabled', true)
  if (error) throw error
  return data ?? []
}

// Every request this rep has raised (RLS scopes to their own).
export async function fetchMyPayoutRequests() {
  const { data, error } = await supabase
    .from('payout_requests')
    .select('*')
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createPayoutRequest({ accountingId, connectionId, amount, note, seasonLabel }) {
  const { data, error } = await supabase
    .from('payout_requests')
    .insert({
      accounting_id: accountingId,
      connection_id: connectionId ?? null,
      amount_requested: amount,
      note: note || null,
      season_label: seasonLabel || null,
    })
    .select()
    .single()
  if (error) {
    // The partial unique index is the friendliest guard we have against a rep
    // queuing two open asks at the same accountant.
    if (error.code === '23505') throw new Error('You already have a pending request with this accountant.')
    throw error
  }
  return data
}

export async function cancelPayoutRequest(id) {
  const { data, error } = await supabase
    .from('payout_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Accounting side ─────────────────────────────────────────────────

// Requests sent TO the current accounting user (RLS scopes by accounting_id).
export async function fetchIncomingPayoutRequests() {
  const { data, error } = await supabase
    .from('payout_requests')
    .select('*')
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Approve for an amount that may be lower than asked — the whole point, since
// only accounting knows how much of the underlying invoicing has been paid.
export async function approvePayoutRequest(id, { amountApproved, responseNote }) {
  return respond(id, {
    status: 'approved',
    amount_approved: amountApproved,
    response_note: responseNote || null,
    responded_at: new Date().toISOString(),
  })
}

export async function rejectPayoutRequest(id, { responseNote }) {
  return respond(id, {
    status: 'rejected',
    response_note: responseNote || null,
    responded_at: new Date().toISOString(),
  })
}

export async function markPayoutPaid(id) {
  return respond(id, { status: 'paid', paid_at: new Date().toISOString() })
}

async function respond(id, updates) {
  const { data, error } = await supabase
    .from('payout_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
