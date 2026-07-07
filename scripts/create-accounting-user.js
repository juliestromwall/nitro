/**
 * Create a test Accounting user (for verifying the accounting role locally).
 *
 * Usage:
 *   export SUPABASE_SERVICE_KEY="your-service-role-key"   # from Supabase dashboard → Project Settings → API
 *   node scripts/create-accounting-user.js
 *
 * Creates (or updates) accounting-test@repcommish.com with password "Accounting123!"
 * and sets app_metadata.role = 'accounting'. Email is auto-confirmed so you can log in immediately.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Pull the project URL from .env (VITE_SUPABASE_URL) so you only need the service key.
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const supabaseUrl = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_SERVICE_KEY (and SUPABASE_URL / VITE_SUPABASE_URL).')
  process.exit(1)
}

const EMAIL = 'accounting-test@repcommish.com'
const PASSWORD = 'Accounting123!'

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

// Find an existing user with this email, if any (paginate the admin list).
async function findUser() {
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((u) => u.email === EMAIL)
    if (match) return match
    if (data.users.length < 200) return null
    page++
  }
}

const existing = await findUser()

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { ...existing.app_metadata, role: 'accounting' },
  })
  if (error) throw error
  console.log(`Updated existing user ${EMAIL} → role=accounting`)
} else {
  const { error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'accounting' },
  })
  if (error) throw error
  console.log(`Created ${EMAIL} → role=accounting`)
}

console.log(`\nLog in at http://localhost:5173/login`)
console.log(`  Email:    ${EMAIL}`)
console.log(`  Password: ${PASSWORD}`)
