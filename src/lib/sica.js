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

// Kick the monthly sync on demand (the "Refresh scores" button). No countryid →
// the function defaults to US (2). Throws with a readable message on failure
// (e.g. the function isn't deployed yet).
export async function refreshSica() {
  const { data, error } = await supabase.functions.invoke('sync-sica', { body: {} })
  if (error) throw new Error(error.message || 'SICA sync failed — is the sync-sica function deployed?')
  if (data?.error) throw new Error(data.error)
  return data
}
