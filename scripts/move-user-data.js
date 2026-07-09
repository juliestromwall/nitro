/**
 * Move (reassign) all of one user's data to another user.
 *
 * Use case: put demo@repcommish.com's companies/accounts/orders/commissions/todos
 * under accounting@foundrydist.com so that accounting user sees them on Accounts + Reports.
 *
 * SAFE BY DEFAULT: runs a DRY RUN (reports counts, changes nothing) unless you pass --confirm.
 *
 * Usage:
 *   export SUPABASE_SERVICE_KEY="your-service-role-key"
 *   node scripts/move-user-data.js                 # dry run — shows what WOULD move
 *   node scripts/move-user-data.js --confirm        # actually moves the data
 *
 * Config below: SOURCE_EMAIL (data comes from), TARGET_EMAIL (data goes to),
 * TARGET_PASSWORD (set on the target user), TARGET_ROLE.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// ── Config ──────────────────────────────────────────────────────────────
const SOURCE_EMAIL = 'demo@repcommish.com'
const TARGET_EMAIL = 'accounting@foundrydist.com'
const TARGET_PASSWORD = 'Foundry123!'          // set on the target user (change after first login)
const TARGET_ROLE = 'accounting'
// Tables to move, in FK-safe order. Every one is keyed by user_id.
const TABLES = ['companies', 'clients', 'seasons', 'orders', 'commissions', 'todos']
// ────────────────────────────────────────────────────────────────────────

const CONFIRM = process.argv.includes('--confirm')

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const supabaseUrl = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_SERVICE_KEY (and SUPABASE_URL / VITE_SUPABASE_URL).')
  process.exit(1)
}
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

async function findUserByEmail(email) {
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => x.email === email)
    if (u) return u
    if (data.users.length < 200) return null
    page++
  }
}

// 1. Resolve source user
const source = await findUserByEmail(SOURCE_EMAIL)
if (!source) { console.error(`Source user ${SOURCE_EMAIL} not found — nothing to move.`); process.exit(1) }
console.log(`Source: ${SOURCE_EMAIL} → ${source.id}`)

// 2. Resolve or create target user
let target = await findUserByEmail(TARGET_EMAIL)
if (target) {
  console.log(`Target: ${TARGET_EMAIL} → ${target.id} (exists)`)
  if (CONFIRM && target.app_metadata?.role !== TARGET_ROLE) {
    await admin.auth.admin.updateUserById(target.id, { app_metadata: { ...target.app_metadata, role: TARGET_ROLE } })
    console.log(`  set role=${TARGET_ROLE}`)
  }
} else if (CONFIRM) {
  const { data, error } = await admin.auth.admin.createUser({
    email: TARGET_EMAIL, password: TARGET_PASSWORD, email_confirm: true,
    app_metadata: { role: TARGET_ROLE },
  })
  if (error) throw error
  target = data.user
  console.log(`Target: created ${TARGET_EMAIL} → ${target.id} (password: ${TARGET_PASSWORD})`)
} else {
  console.log(`Target: ${TARGET_EMAIL} does NOT exist yet — would be created on --confirm.`)
}

// 3. Count + (optionally) move each table
console.log(`\n${CONFIRM ? '=== MOVING ===' : '=== DRY RUN (no changes) ==='}`)
let totalMoved = 0
for (const table of TABLES) {
  const { count, error: cErr } = await admin
    .from(table).select('*', { count: 'exact', head: true }).eq('user_id', source.id)
  if (cErr) { console.log(`  ${table}: count error — ${cErr.message}`); continue }
  totalMoved += count || 0
  if (!CONFIRM || !target) { console.log(`  ${table}: ${count} rows would move`); continue }
  const { error: uErr } = await admin.from(table).update({ user_id: target.id }).eq('user_id', source.id)
  console.log(uErr ? `  ${table}: MOVE FAILED — ${uErr.message}` : `  ${table}: moved ${count} rows`)
}
console.log(`\nTotal rows ${CONFIRM ? 'moved' : 'that would move'}: ${totalMoved}`)
if (!CONFIRM) console.log(`\nThis was a dry run. Re-run with --confirm to apply.`)
else console.log(`\nDone. ${TARGET_EMAIL} now owns the data — visible on their Accounts + Reports pages.`)
