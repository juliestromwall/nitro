// Publishing accounting's per-rep "Available" figure through to the rep side.
//
// Accounting's portal is the only place that knows what customers have actually
// paid, so it computes Available and pushes the resulting number here. The rep
// then sees a real figure instead of guessing from their own sales maths, and
// requests a payout against it.
import { supabase } from '@/lib/supabase'
import { fetchConnections, fetchRepDetails } from '@/lib/accountingDb'

const norm = (s) => String(s || '').trim().toLowerCase()

// ── Rep side ────────────────────────────────────────────────────────

// The figure this rep's accountant last published (null if none yet).
export async function fetchMyAvailability() {
  const { data, error } = await supabase
    .from('rep_payout_availability')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

// ── Accounting side ─────────────────────────────────────────────────

// Match accounting's internal reps to the reps actually connected in the app.
// Portal reps carry an email, and so do the connected auth users, so the join is
// by email — case-insensitive, since the portal list isn't consistently cased.
// Returns { matched: [{portalRep, repId, email}], unmatched: [portalRep] }.
export async function matchPortalRepsToConnections(portalReps) {
  const conns = (await fetchConnections()).filter(
    (c) => c.status === 'active' && c.sharing_enabled,
  )
  if (!conns.length) return { matched: [], unmatched: portalReps, connections: [] }

  const details = await fetchRepDetails([...new Set(conns.map((c) => c.rep_id))])
  const byEmail = new Map()
  for (const c of conns) {
    const email = norm(details[c.rep_id]?.email)
    if (email) byEmail.set(email, c.rep_id)
  }

  const matched = [], unmatched = []
  for (const pr of portalReps) {
    const repId = byEmail.get(norm(pr.email))
    if (repId) matched.push({ portalRep: pr, repId, email: norm(pr.email) })
    else unmatched.push(pr)
  }
  return { matched, unmatched, connections: conns }
}

// Publish one figure per matched rep. Upsert on (accounting_id, rep_id) so
// republishing replaces rather than stacking up.
export async function publishAvailability(rows) {
  if (!rows.length) return []
  const { data: { user } } = await supabase.auth.getUser()
  const payload = rows.map((r) => ({
    accounting_id: user.id,
    rep_id: r.repId,
    amount_available: Math.round((Number(r.amount) || 0) * 100) / 100,
    as_of: r.asOf || new Date().toISOString().slice(0, 10),
    note: r.note || null,
    portal_rep_key: r.portalRepKey || null,
    published_at: new Date().toISOString(),
  }))
  const { data, error } = await supabase
    .from('rep_payout_availability')
    .upsert(payload, { onConflict: 'accounting_id,rep_id' })
    .select()
  if (error) throw error
  return data ?? []
}

// What accounting has already published, keyed by rep_id, for showing state.
export async function fetchPublishedAvailability() {
  const { data, error } = await supabase.from('rep_payout_availability').select('*')
  if (error) throw error
  return Object.fromEntries((data ?? []).map((r) => [r.rep_id, r]))
}
