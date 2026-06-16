// One-shot script: merge a new customer master CSV into ACCOUNTS in
// src/lib/paymentsDemoData.js, cross-referencing BP contact IDs.
//
// Rules:
//   - Match by BP contactId (looked up from BP export file)
//   - Match BP entries from CSV name via: manual override > exact name > email > fuzzy
//   - Preserve existing acct-XXX IDs
//   - New entries get next-available acct-XXX
//   - When multiple CSV rows resolve to same cid (e.g. merged customers like
//     Hoback Sports + Hole In The Wall both → Jackson Hole Mountain Resort),
//     keep the existing ACCOUNT's name (skip rename) — apply other fields
//     from first occurrence only.
//   - Existing accounts NOT in CSV are kept untouched (no deletes).

import { readFileSync, writeFileSync } from 'fs'
import XLSX from 'xlsx'
import { ACCOUNTS } from '../src/lib/paymentsDemoData.js'

const FILE_DEMO = '/Users/foundrydistribution/Projects/nitro/src/lib/paymentsDemoData.js'
const FILE_BP   = '/Users/foundrydistribution/Projects/nitro/Invoice data/6.16.26 BP Customer contact IDs.xls'
const FILE_CSV  = '/Users/foundrydistribution/Projects/nitro/Invoice data/Foundry Distribution, Inc_Customer List - Territory + Rep 2025 (1).csv'

const norm = s => String(s||'').toLowerCase().replace(/\s*-\s*[^-]+$/,'').replace(/\(.*?\)/g,'').replace(/['`,.]/g,'').replace(/\s+/g,' ').trim()
const stripCorp = s => norm(s).replace(/\b(llc|inc|corp|co|wsr|use routing guide|need dealer app|dba)\b/g,'').replace(/[\/&]/g,' ').replace(/\s+/g,' ').trim()
const firstWords = (s, n) => stripCorp(s).split(' ').slice(0, n).join(' ')
const emailNorm = s => String(s||'').trim().toLowerCase()
const splitName = s => {
  const t = String(s||'').replace(/\s+/g,' ').trim()
  if (!t) return [null, null]
  const ps = t.split(' ')
  return [ps[0] || null, ps.slice(1).join(' ') || null]
}

// Load BP contact-ids
const idWb = XLSX.read(readFileSync(FILE_BP), { type: 'buffer' })
const idRows = XLSX.utils.sheet_to_json(idWb.Sheets[idWb.SheetNames[0]], { header: 1, defval: null })
const bp = []
for (let i = 1; i < idRows.length; i++) {
  const r = idRows[i]; if (!r) continue
  const cid = r[0] ? String(r[0]).trim() : ''
  const company = r[2] ? String(r[2]).trim() : ''
  if (!cid || !company) continue
  bp.push({ cid, company, normCo: stripCorp(company), email: emailNorm(r[5]) })
}
const bpByEmail = new Map();    for (const b of bp) if (b.email) bpByEmail.set(b.email, b)
const bpByExactNorm = new Map(); for (const b of bp) if (!bpByExactNorm.has(norm(b.company))) bpByExactNorm.set(norm(b.company), b)
const bpByCid = new Map();       for (const b of bp) bpByCid.set(b.cid, b)

// Manual overrides (per Tony 2026-06-16)
const MANUAL_OVERRIDES = new Map([
  ['hoback sports', '783'],                       // → Jackson Hole Mountain Resort - Retail
  ['tributary driggs acquisition, llc', '2405'],
])

// Resolver: CSV row → BP contact ID
function resolveBp(name, email) {
  const m = MANUAL_OVERRIDES.get(name.toLowerCase())
  if (m) return bpByCid.get(m)
  const ex = bpByExactNorm.get(norm(name))
  if (ex) return ex
  const em = bpByEmail.get(emailNorm(email))
  if (em) return em
  const stripped = stripCorp(name)
  const sm = bp.find(b => b.normCo === stripped)
  if (sm) return sm
  for (const n of [2, 3]) {
    const k = firstWords(name, n)
    if (k.length > (n === 2 ? 4 : 6)) {
      const c = bp.filter(b => firstWords(b.company, n) === k)
      if (c.length === 1) return c[0]
    }
  }
  return null
}

// Load master CSV
const wb = XLSX.read(readFileSync(FILE_CSV), { type: 'buffer' })
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })

// First pass: count cid occurrences in CSV (for duplicate handling)
const cidCount = new Map()
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]; if (!r) continue
  const name = String(r[0] || '').trim(); if (!name) continue
  if (/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day/.test(name)) continue
  const email = r[2] ? String(r[2]).trim() : null
  const bpEntry = resolveBp(name, email)
  if (!bpEntry) continue
  cidCount.set(bpEntry.cid, (cidCount.get(bpEntry.cid) || 0) + 1)
}

// Index existing ACCOUNTS by contactId
const existingByCid = new Map()
for (const a of ACCOUNTS) if (a.contactId) existingByCid.set(String(a.contactId), a)

// Find max acct-N for new IDs
let maxAcctNum = 0
for (const a of ACCOUNTS) {
  const m = String(a.id || '').match(/^acct-(\d+)$/)
  if (m) maxAcctNum = Math.max(maxAcctNum, parseInt(m[1], 10))
}
let nextAcct = maxAcctNum + 1

// Build the merged list, preserving existing order
const updates = new Map() // acctId → patch
const seenCids = new Set()
const newEntries = []

for (let i = 1; i < rows.length; i++) {
  const r = rows[i]; if (!r) continue
  const name = String(r[0] || '').trim(); if (!name) continue
  if (/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day/.test(name)) continue
  const [first, last] = splitName(r[1])
  const email = r[2] ? String(r[2]).trim() : null
  const territory = r[5] ? String(r[5]).trim() : null
  const bpEntry = resolveBp(name, email)
  if (!bpEntry) continue
  const cid = bpEntry.cid
  if (seenCids.has(cid)) continue // duplicate cid in CSV — first row wins
  seenCids.add(cid)
  const isDup = (cidCount.get(cid) || 0) > 1
  const existing = existingByCid.get(cid)
  if (existing) {
    const patch = { territory, firstName: first, lastName: last, email }
    if (!isDup) patch.name = name
    updates.set(existing.id, patch)
  } else {
    newEntries.push({
      id: `acct-${nextAcct++}`,
      name,
      territory,
      contactId: cid,
      firstName: first,
      lastName: last,
      email,
    })
  }
}

// Render the new ACCOUNTS array body
function escStr(s) {
  if (s === null || s === undefined) return 'null'
  return JSON.stringify(String(s))
}
function renderEntry(a) {
  return `  {"id": ${escStr(a.id)}, "name": ${escStr(a.name)}, "territory": ${escStr(a.territory)}, "contactId": ${escStr(a.contactId)}, "firstName": ${escStr(a.firstName)}, "lastName": ${escStr(a.lastName)}, "email": ${escStr(a.email)}},`
}

const merged = []
for (const a of ACCOUNTS) {
  const patch = updates.get(a.id)
  if (patch) {
    const updated = { ...a }
    for (const [k, v] of Object.entries(patch)) {
      if (v !== null && v !== undefined && v !== '') updated[k] = v
    }
    merged.push(updated)
  } else {
    merged.push(a)
  }
}
for (const n of newEntries) merged.push(n)

const body = merged.map(renderEntry).join('\n')
const newBlock = `export const ACCOUNTS = [\n${body}\n]`

// In-place replace in the file
const src = readFileSync(FILE_DEMO, 'utf8')
const re = /export const ACCOUNTS = \[\n[\s\S]*?\n\]/
if (!re.test(src)) { console.error('ACCOUNTS block not found'); process.exit(1) }
const out = src.replace(re, newBlock)
writeFileSync(FILE_DEMO, out)

console.log('Merge applied.')
console.log('  Existing ACCOUNTS count:', ACCOUNTS.length)
console.log('  Updates applied:        ', updates.size)
console.log('  New entries added:      ', newEntries.length)
console.log('  Final count:            ', merged.length)
console.log('  Next acct id:           ', `acct-${nextAcct}`)
