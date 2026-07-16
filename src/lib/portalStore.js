// Supabase-backed key/value store for the commission portal's datasets.
// Replaces the browser-local IndexedDB/localStorage stores so every authorized
// login (Tony's brand_admin, accounting@foundrydist.com) reads and writes the
// same live data. One row per dataset key in public.portal_data; the value is
// the whole JSON blob (the app still loads full datasets into memory and
// computes commissions client-side — only the persistence layer moved).
//
// Public API mirrors the old idbGet/idbSet/idbDel so the individual store
// modules just re-point their plumbing here.

import { supabase } from './supabase'

const TABLE = 'portal_data'

// Datasets can be large (line_items is ~MB / tens of thousands of rows), and
// the Supabase client in supabase.js aborts ordinary requests after 15s.
// Passing our own AbortSignal both raises the ceiling AND bypasses that 15s
// timer (its custom fetch skips its own timeout when a signal is supplied).
const LONG_MS = 120000
function longSignal() {
  try { return AbortSignal.timeout(LONG_MS) } catch { return undefined }
}
function withSignal(builder) {
  const sig = longSignal()
  return sig ? builder.abortSignal(sig) : builder
}

// Returns the stored value for `key`, or undefined when absent (matching the
// old IndexedDB idbGet behaviour so callers' Array.isArray/typeof guards work).
export async function pget(key) {
  const { data, error } = await withSignal(
    supabase.from(TABLE).select('value').eq('key', key)
  ).maybeSingle()
  if (error) throw error
  return data ? data.value : undefined
}

export async function pset(key, value) {
  const { error } = await withSignal(
    supabase.from(TABLE).upsert({ key, value }, { onConflict: 'key' })
  )
  if (error) throw error
}

export async function pdel(key) {
  const { error } = await withSignal(
    supabase.from(TABLE).delete().eq('key', key)
  )
  if (error) throw error
}

// Batch read — one round trip for several keys. Returns a plain object keyed
// by the requested keys (missing keys simply absent).
export async function pgetMany(keys) {
  const { data, error } = await withSignal(
    supabase.from(TABLE).select('key,value').in('key', keys)
  )
  if (error) throw error
  const out = {}
  for (const row of data || []) out[row.key] = row.value
  return out
}
