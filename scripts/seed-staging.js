/**
 * Seed the STAGING Supabase project with two test users for verifying the
 * accounting ↔ rep link end-to-end. Reads the project URL from .env.staging
 * and the service-role key from the SUPABASE_SERVICE_KEY env var.
 *
 * Usage:
 *   export SUPABASE_SERVICE_KEY="staging-service-role-key"   # staging project → Settings → API
 *   node scripts/seed-staging.js
 *
 * Creates (or updates), email auto-confirmed, plan=free (bypasses billing):
 *   accounting-test@repcommish.com / Accounting123!   role = accounting
 *   adam@repcommish.com            / RepAdam123!       role = pro_rep
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.staging', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const url = env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!url || url.includes('YOUR-STAGING-REF')) {
  console.error('✗ .env.staging VITE_SUPABASE_URL is not set to your staging project.')
  process.exit(1)
}
if (!serviceKey) {
  console.error('✗ Set SUPABASE_SERVICE_KEY (staging service-role key) in your env first.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const users = [
  { email: 'accounting-test@repcommish.com', password: 'Accounting123!', role: 'accounting' },
  { email: 'adam@repcommish.com', password: 'RepAdam123!', role: 'pro_rep' },
]

async function findByEmail(email) {
  // Page through users (staging is tiny) to find an existing match.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email === email) || null
}

for (const u of users) {
  const existing = await findByEmail(u.email)
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { role: u.role },
      user_metadata: { plan: 'free' },
    })
    console.log(`↻ updated ${u.email} → role=${u.role}`)
  } else {
    const { error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      app_metadata: { role: u.role },
      user_metadata: { plan: 'free' },
    })
    if (error) { console.error(`✗ ${u.email}: ${error.message}`); continue }
    console.log(`✓ created ${u.email} (${u.password}) → role=${u.role}`)
  }
}

console.log('\nDone. Log in at your staging URL with the credentials above.')
