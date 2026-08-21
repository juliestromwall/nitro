// One-shot, additive: attach a `phone` field to ACCOUNTS in paymentsDemoData.js
// from the customer master CSV's Phone column. Joins by BP contact id (same
// resolver as merge-customer-master.js), so it lines up with the existing `email`
// join. ONLY adds phone — no names/territories/emails changed, no accounts added.

import { readFileSync, writeFileSync } from 'fs'
import XLSX from 'xlsx'
import { ACCOUNTS } from '../src/lib/paymentsDemoData.js'

const FILE_DEMO = '/Users/foundrydistribution/Projects/nitro/src/lib/paymentsDemoData.js'
const FILE_BP   = '/Users/foundrydistribution/Projects/nitro/Invoice data/6.16.26 BP Customer contact IDs.xls'
const FILE_CSV  = '/Users/foundrydistribution/Projects/nitro/Invoice data/Foundry Distribution, Inc_Customer List - Territory + Rep 2025 (1).csv'

const norm = s => String(s||'').toLowerCase().replace(/\s*-\s*[^-]+$/,'').replace(/\(.*?\)/g,'').replace(/['`,.]/g,'').replace(/\s+/g,' ').trim()
const stripCorp = s => norm(s).replace(/\b(llc|inc|corp|co|wsr|use routing guide|need dealer app|dba)\b/g,'').replace(/[/&]/g,' ').replace(/\s+/g,' ').trim()
const firstWords = (s, n) => stripCorp(s).split(' ').slice(0, n).join(' ')
const emailNorm = s => String(s||'').trim().toLowerCase()

// BP contact-id index
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
const bpByEmail = new Map();     for (const b of bp) if (b.email) bpByEmail.set(b.email, b)
const bpByExactNorm = new Map(); for (const b of bp) if (!bpByExactNorm.has(norm(b.company))) bpByExactNorm.set(norm(b.company), b)
const bpByCid = new Map();       for (const b of bp) bpByCid.set(b.cid, b)

const MANUAL_OVERRIDES = new Map([
  ['hoback sports', '783'],
  ['tributary driggs acquisition, llc', '2405'],
])
function resolveBp(name, email) {
  const m = MANUAL_OVERRIDES.get(name.toLowerCase())
  if (m) return bpByCid.get(m)
  const ex = bpByExactNorm.get(norm(name)); if (ex) return ex
  const em = bpByEmail.get(emailNorm(email)); if (em) return em
  const stripped = stripCorp(name)
  const sm = bp.find(b => b.normCo === stripped); if (sm) return sm
  for (const n of [2, 3]) {
    const k = firstWords(name, n)
    if (k.length > (n === 2 ? 4 : 6)) {
      const c = bp.filter(b => firstWords(b.company, n) === k)
      if (c.length === 1) return c[0]
    }
  }
  return null
}

// CSV → cid → phone (first occurrence wins)
const wb = XLSX.read(readFileSync(FILE_CSV), { type: 'buffer' })
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
const phoneByCid = new Map()
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]; if (!r) continue
  const name = String(r[0] || '').trim(); if (!name) continue
  if (/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day/.test(name)) continue
  const phone = r[3] ? String(r[3]).trim() : ''
  if (!phone) continue
  const email = r[2] ? String(r[2]).trim() : null
  const bpEntry = resolveBp(name, email)
  if (!bpEntry) continue
  if (!phoneByCid.has(bpEntry.cid)) phoneByCid.set(bpEntry.cid, phone)
}

// Attach phone by contactId
let added = 0
const merged = ACCOUNTS.map(a => {
  const phone = a.contactId ? phoneByCid.get(String(a.contactId)) : null
  if (phone && !a.phone) { added++; return { ...a, phone } }
  return a
})

const escStr = s => (s === null || s === undefined) ? 'null' : JSON.stringify(String(s))
const renderEntry = a => {
  const base = `  {"id": ${escStr(a.id)}, "name": ${escStr(a.name)}, "territory": ${escStr(a.territory)}, "contactId": ${escStr(a.contactId)}, "firstName": ${escStr(a.firstName)}, "lastName": ${escStr(a.lastName)}, "email": ${escStr(a.email)}`
  return a.phone ? `${base}, "phone": ${escStr(a.phone)}},` : `${base}},`
}
const newBlock = `export const ACCOUNTS = [\n${merged.map(renderEntry).join('\n')}\n]`
const src = readFileSync(FILE_DEMO, 'utf8')
const re = /export const ACCOUNTS = \[\n[\s\S]*?\n\]/
if (!re.test(src)) { console.error('ACCOUNTS block not found'); process.exit(1) }
writeFileSync(FILE_DEMO, src.replace(re, newBlock))

console.log('Phones added:', added, 'of', ACCOUNTS.length, 'accounts')
console.log('Sample:', merged.filter(a => a.phone).slice(0, 3).map(a => `${a.name} → ${a.phone}`))
