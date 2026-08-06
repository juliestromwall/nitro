// Client read/refresh layer for SICA credit data (Stage C).
//
// The scores themselves are pulled server-side by the `sync-sica` edge function
// (Basic-auth password must stay off the client) into the sica_* tables. Here we
// only READ the `sica_latest` view + match overrides, and INVOKE the function for
// the "Refresh scores" button. Everything degrades gracefully: if the tables
// aren't deployed yet, `available` is false and the UI shows "—".
//
// See docs/sica-integration-spec.md.

import { supabase } from './supabase'

// SICAdex: 1 = best, 100 = worst (a weighted avg of members' AR aging on a
// retailer). Risk tiers use the mockup's illustrative thresholds.
export function sicaRisk(score) {
  if (score == null) return null
  if (score >= 60) return { tier: 'High risk', fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' }
  if (score >= 30) return { tier: 'Moderate', fg: '#b45309', bg: '#fffbeb', border: '#fde68a' }
  return { tier: 'Low risk', fg: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' }
}

// SICAdex variance vs same-month-last-year. Per the spec a NEGATIVE
// sicadexVarianceSMLY means the score ROSE (worsened). That sign is flagged
// UNVERIFIED in the spec — confirm against the SICAWEB portal once live data
// lands, and flip this one constant if it's backwards.
const SCORE_ROSE_WHEN_VARIANCE_NEGATIVE = true
export function scoreRose(variance) {
  if (variance == null) return null
  return SCORE_ROSE_WHEN_VARIANCE_NEGATIVE ? variance < 0 : variance > 0
}

// Load latest score + overdue per retailer, the human match overrides, and the
// last successful sync time. Defensive: any error (incl. tables not yet created)
// resolves to an empty, `available:false` result rather than throwing.
export async function loadSica() {
  const empty = { retailers: [], overrides: {}, lastSync: null, available: false }
  try {
    const [latestRes, matchRes, logRes] = await Promise.all([
      supabase.from('sica_latest').select('*'),
      supabase.from('sica_account_matches').select('account_key, retailer_id, confirmed'),
      supabase.from('sica_sync_log').select('status, finished_at').eq('status', 'ok').order('finished_at', { ascending: false }).limit(1),
    ])
    if (latestRes.error) return empty
    const overrides = {}
    for (const m of matchRes.data || []) overrides[m.account_key] = m
    return {
      retailers: latestRes.data || [],
      overrides,
      lastSync: logRes.data?.[0]?.finished_at || null,
      available: true,
    }
  } catch {
    return empty
  }
}

// ── Match overrides (Stage C.2) ─────────────────────────────────────────
// Human-curated refinements over the fuzzy name match, keyed by a stable account
// key. retailerId = a SICA retailer id (a confirmed/corrected match) or null (an
// explicit "not a match" that suppresses the fuzzy guess → "—").
export async function saveSicaMatch(accountKey, retailerId, { source = 'manual', confirmed = true } = {}) {
  const row = {
    account_key: accountKey,
    retailer_id: retailerId ?? null,
    match_source: source,
    confirmed,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('sica_account_matches').upsert(row, { onConflict: 'account_key' })
  if (error) throw new Error(error.message || 'Could not save the match')
  return row
}

// Delete the override entirely → the account falls back to the fuzzy name match.
export async function removeSicaMatch(accountKey) {
  const { error } = await supabase.from('sica_account_matches').delete().eq('account_key', accountKey)
  if (error) throw new Error(error.message || 'Could not clear the override')
}

// Kick the monthly sync on demand (the "Refresh scores" button). No countryid →
// the function defaults to US (2). Throws with a readable message on failure
// (e.g. the function isn't deployed yet).
export async function refreshSica() {
  // A full sync (3 SICA calls + upserts) can run longer than the Supabase client's
  // default 15s fetch abort — which surfaces as "Failed to send a request to the
  // Edge Function" even though the sync completes server-side. So call the function
  // with our own fetch and a generous timeout instead of supabase.functions.invoke.
  const url = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || anon

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    const res = await fetch(`${url}/functions/v1/sync-sica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
      body: '{}',
      signal: controller.signal,
    })
    let body = {}
    try { body = await res.json() } catch { /* non-JSON response */ }
    if (!res.ok) throw new Error(body.error || `sync-sica returned ${res.status}`)
    return body
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('The sync is taking a while — it may still finish in the background. Reload in a minute to see updated scores.')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
