/**
 * Seed script for Nitro Sales Tracker
 *
 * Usage:
 *   1. Sign up a user in the app first
 *   2. Set environment variables:
 *      export SUPABASE_URL="https://your-project.supabase.co"
 *      export SUPABASE_SERVICE_KEY="your-service-role-key"
 *      export SEED_USER_ID="the-user-uuid-from-auth.users"
 *   3. Run: node scripts/seed.js
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
const userId = process.env.SEED_USER_ID

if (!supabaseUrl || !supabaseServiceKey || !userId) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, SEED_USER_ID')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// ── Seed Data ──────────────────────────────────────────────

const companies = [
  { name: 'Nitro Snowboards', commission_percent: 5, logo_path: '/nitro-icon.png', archived: false, sort_order: 0 },
  { name: 'Union Bindings', commission_percent: 7, logo_path: null, archived: false, sort_order: 1 },
  { name: '686 Outerwear', commission_percent: 10, logo_path: null, archived: false, sort_order: 2 },
]

const clients = [
  { name: 'Alpen Haus Ski Center', account_number: '26131417347', region: 'Mid Atlantic', type: 'Ski Shop (Off Site)', city: 'Warwick', state: 'NY' },
  { name: 'Alpin Haus', account_number: '26129806636', region: 'Mid Atlantic', type: 'Ski Shop (Off Site)', city: 'Amsterdam', state: 'NY' },
  { name: 'Alpine Valley WI', account_number: '26128073758', region: 'Midwest', type: 'Resort', city: 'East Troy', state: 'WI' },
  { name: 'Andes Tower Hills', account_number: '26130890265', region: 'Midwest', type: 'Resort', city: 'Kensington', state: 'MN' },
  { name: 'Angel Fire Resort', account_number: '26124721453', region: 'Rockies', type: 'Resort', city: 'Angel Fire', state: 'NM' },
  { name: 'Angles Sports Ski Board and Fly Shop', account_number: '26133608842', region: 'Rockies', type: 'Ski Shop (Off Site)', city: 'Herber City', state: 'UT' },
  { name: 'Arizona Snowbowl', account_number: '26128568597', region: 'Rockies', type: 'Resort', city: 'Flagstaff', state: 'AZ' },
  { name: 'Backcountry Essentials', account_number: '26130426778', region: 'PNW', type: 'Ski Shop (Off Site)', city: 'Bellingham', state: 'WA' },
  { name: 'Base Mountain Sports', account_number: '26127455283', region: 'Rockies', type: 'Ski Shop (Off Site)', city: 'Breckenridge', state: 'CO' },
  { name: 'Bear Valley Rental / Chains Required', account_number: '26129341523', region: 'PNW', type: 'Resort', city: 'Bear Valley', state: 'CA' },
  { name: 'Berkshire East', account_number: '26133608833', region: 'New England', type: 'Resort', city: 'Charlemont', state: 'MA' },
  { name: "Bill's Ski Rentals", account_number: '26127919641', region: 'Rockies', type: 'Ski Shop (Off Site)', city: 'Winter Park', state: 'CO' },
  { name: 'Black Tie Boone', account_number: '26178979840', region: 'Southeast', type: 'Ski Shop (Off Site)', city: 'Boone', state: 'NC' },
  { name: 'Black Tie Breckenridge', account_number: '26125523844', region: 'Rockies', type: 'Chain', city: 'Breckenridge', state: 'CO' },
  { name: 'Black Tie Schweitzer', account_number: '26134073111', region: 'PNW', type: 'Ski Shop (Off Site)', city: 'Sandpoint', state: 'ID' },
  { name: 'Black Tie Whitefish', account_number: '26128878245', region: 'Rockies', type: 'Ski Shop (Off Site)', city: 'Whitefish', state: 'MT' },
  { name: "Blauer's Board Shop", account_number: '26134381105', region: 'Midwest', type: 'Ski Shop (Off Site)', city: 'St. Cloud', state: 'MN' },
  { name: 'Board Paradise', account_number: '26128568606', region: 'Rockies', type: 'Ski Shop (Off Site)', city: 'Durango', state: 'CO' },
  { name: 'Bolton Valley Resort', account_number: '26131107421', region: 'New England', type: 'Resort', city: 'Bolton Valley', state: 'VT' },
  { name: 'Bridger Bowl', account_number: '26133453171', region: 'Rockies', type: 'Resort', city: 'Bozeman', state: 'MT' },
  { name: 'Cannonsburg Ski Area', account_number: '26132502307', region: 'Midwest', type: 'Resort', city: 'Belmont', state: 'MI' },
  { name: 'Crystal Mountain Resort', account_number: '26124567121', region: 'PNW', type: 'Resort', city: 'Crystal Mountain', state: 'WA' },
  { name: 'Dodge Ridge', account_number: '26129032373', region: 'PNW', type: 'Resort', city: 'Pinecrest', state: 'CA' },
  { name: 'Grand Targhee Resort', account_number: '26125834530', region: 'Rockies', type: 'Resort SARA Group', city: 'Alta', state: 'WY' },
  { name: 'Hyland Hills Ski Area', account_number: '26130426797', region: 'Midwest', type: 'Resort', city: 'Bloomington', state: 'MN' },
]

const seasons = [
  { id: 'us-2024-2025', label: 'US 2024-2025', country: 'US', year: '2024-2025', archived: false },
  { id: 'ca-2024-2025', label: 'CA 2024-2025', country: 'CA', year: '2024-2025', archived: false },
  { id: 'us-2025-2026', label: 'US 2025-2026', country: 'US', year: '2025-2026', archived: false },
  { id: 'ca-2025-2026', label: 'CA 2025-2026', country: 'CA', year: '2025-2026', archived: false },
  { id: 'us-2026-2027', label: 'US 2026-2027', country: 'US', year: '2026-2027', archived: false },
  { id: 'ca-2026-2027', label: 'CA 2026-2027', country: 'CA', year: '2026-2027', archived: false },
]

// Orders reference client and company by index (0-based), mapped to DB ids after insert
const ordersData = [
  // US 2025-2026 season — Nitro (company idx 0)
  { clientIdx: 0, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Upgraded Boards'], order_number: 'E6951 - 127440', invoice_number: 'INV-2025-001', close_date: '2/28/2025', stage: 'Closed - Won', total: 993.60 },
  { clientIdx: 1, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Upgraded Boards', 'Rental Boots', 'Rental Bindings'], order_number: 'E8349', invoice_number: 'INV-2025-002', close_date: '12/5/2025', stage: 'Closed - Won', total: 3584.00 },
  { clientIdx: 2, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Bindings'], order_number: 'E9206', invoice_number: 'INV-2026-001', close_date: '1/12/2026', stage: 'Closed - Won', total: 259.20 },
  { clientIdx: 3, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Retail Bindings'], order_number: '6599 - 126829', invoice_number: 'INV-2025-003', close_date: '2/13/2025', stage: 'Closed - Won', total: 282.00 },
  { clientIdx: 3, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Bindings'], order_number: 'E6598 - 126825', invoice_number: 'INV-2025-004', close_date: '2/13/2025', stage: 'Closed - Won', total: 383.40 },
  { clientIdx: 4, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Retail Boards', 'Retail Bindings'], order_number: '5760 - 125769', invoice_number: 'INV-2025-005', close_date: '1/29/2025', stage: 'Closed - Won', total: 4854.00 },
  { clientIdx: 4, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Beginner Boards', 'Rental Boots', 'Rental Bindings'], order_number: '125930', invoice_number: 'INV-2025-006', close_date: '1/28/2025', stage: 'Closed - Won', total: 36178.20 },
  { clientIdx: 5, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Beginner Boards', 'Rental Upgraded Boards'], order_number: 'E8253', invoice_number: 'INV-2025-007', close_date: '12/2/2025', stage: 'Closed - Won', total: 993.60 },
  { clientIdx: 6, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Boots'], order_number: '6822 - 127186', invoice_number: 'INV-2025-008', close_date: '2/22/2025', stage: 'Closed - Won', total: 1957.50 },
  { clientIdx: 7, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Retail Bindings'], order_number: '6901 - 127320', invoice_number: 'INV-2025-009', close_date: '2/25/2025', stage: 'Closed - Won', total: 3117.50 },
  { clientIdx: 7, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Retail Boots', 'Retail Bindings'], order_number: '127319', invoice_number: 'INV-2025-010', close_date: '2/25/2025', stage: 'Closed - Won', total: 4422.00 },
  { clientIdx: 7, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Upgraded Boards', 'Rental Bindings'], order_number: 'E6938 - 127424', invoice_number: 'INV-2025-011', close_date: '2/27/2025', stage: 'Closed - Won', total: 3348.00 },
  { clientIdx: 9, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Upgraded Boards'], order_number: '6594 - 126820', invoice_number: 'INV-2025-012', close_date: '2/13/2025', stage: 'Closed - Won', total: 4554.00 },
  { clientIdx: 10, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Beginner Boards', 'Rental Upgraded Boards', 'Rental Boots', 'Rental Bindings'], order_number: 'E6540 - 126826', invoice_number: 'INV-2025-013', close_date: '2/13/2025', stage: 'Closed - Won', total: 22651.20 },
  { clientIdx: 10, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Retail Bindings'], order_number: 'E3798', invoice_number: 'INV-2025-014', close_date: '2/21/2025', stage: 'Closed - Won', total: 777.60 },
  { clientIdx: 11, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Beginner Boards', 'Rental Boots'], order_number: 'E8861', invoice_number: 'INV-2025-015', close_date: '12/31/2025', stage: 'Closed - Won', total: 1060.00 },
  { clientIdx: 8, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Upgraded Boards', 'Rental Boots'], order_number: '117262', invoice_number: 'INV-2024-017', close_date: '2/15/2024', stage: 'Closed - Won', total: 15217.20 },
  { clientIdx: 18, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Beginner Boards', 'Rental Boots', 'Rental Bindings'], order_number: '117644', invoice_number: 'INV-2024-018', close_date: '2/2/2024', stage: 'Closed - Won', total: 1782.00 },
  { clientIdx: 19, companyIdx: 0, seasonId: 'us-2025-2026', order_type: 'Rental', rental_items: ['Rental Upgraded Boards', 'Rental Boots', 'Rental Bindings'], order_number: '117410', invoice_number: 'INV-2024-019', close_date: '2/2/2024', stage: 'Closed - Won', total: 9142.20 },
  // US 2024-2025
  { clientIdx: 0, companyIdx: 0, seasonId: 'us-2024-2025', order_type: 'Rental', rental_items: ['Rental Upgraded Boards'], order_number: '118167', invoice_number: 'INV-2024-020', close_date: '2/15/2024', stage: 'Closed - Won', total: 1555.20 },
  { clientIdx: 1, companyIdx: 0, seasonId: 'us-2024-2025', order_type: 'Rental', rental_items: ['Rental Upgraded Boards', 'Rental Boots'], order_number: '118359', invoice_number: 'INV-2024-021', close_date: '2/19/2024', stage: 'Closed - Won', total: 42687.00 },
  { clientIdx: 3, companyIdx: 0, seasonId: 'us-2024-2025', order_type: 'Rental', rental_items: ['Rental Bindings'], order_number: '118981', invoice_number: 'INV-2024-022', close_date: '3/15/2024', stage: 'Closed - Won', total: 507.60 },
  { clientIdx: 4, companyIdx: 0, seasonId: 'us-2024-2025', order_type: 'Rental', rental_items: ['Rental Beginner Boards', 'Rental Boots', 'Rental Bindings'], order_number: '118924', invoice_number: 'INV-2024-023', close_date: '3/12/2024', stage: 'Closed - Won', total: 16437.60 },
  { clientIdx: 6, companyIdx: 0, seasonId: 'us-2024-2025', order_type: 'Rental', rental_items: ['Rental Boots'], order_number: '118201', invoice_number: 'INV-2024-024', close_date: '2/15/2024', stage: 'Closed - Won', total: 9720.00 },
  { clientIdx: 10, companyIdx: 0, seasonId: 'us-2024-2025', order_type: 'Rental', rental_items: ['Rental Beginner Boards', 'Rental Upgraded Boards', 'Rental Boots'], order_number: '117202', invoice_number: 'INV-2024-025', close_date: '1/29/2024', stage: 'Closed - Won', total: 18122.80 },
  // CA 2025-2026
  { clientIdx: 20, companyIdx: 0, seasonId: 'ca-2025-2026', order_type: 'Rental', rental_items: ['Rental Upgraded Boards', 'Rental Boots'], order_number: 'CA-4521', invoice_number: 'INV-CA-001', close_date: '3/1/2025', stage: 'Closed - Won', total: 8450.00 },
  { clientIdx: 21, companyIdx: 0, seasonId: 'ca-2025-2026', order_type: 'Rental', rental_items: ['Rental Beginner Boards', 'Rental Bindings'], order_number: 'CA-4588', invoice_number: 'INV-CA-002', close_date: '3/15/2025', stage: 'Closed - Won', total: 12340.00 },
  { clientIdx: 22, companyIdx: 0, seasonId: 'ca-2025-2026', order_type: 'Retail', retail_items: ['Retail Boards', 'Retail Bindings'], order_number: 'CA-4601', invoice_number: 'INV-CA-003', close_date: '2/28/2025', stage: 'Closed - Won', total: 5670.00 },
  // Union Bindings (company idx 1)
  { clientIdx: 4, companyIdx: 1, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Retail Bindings'], order_number: 'UB-1001', invoice_number: 'UB-INV-001', close_date: '1/15/2025', stage: 'Closed - Won', total: 8250.00 },
  { clientIdx: 7, companyIdx: 1, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Retail Bindings'], order_number: 'UB-1002', invoice_number: 'UB-INV-002', close_date: '2/10/2025', stage: 'Closed - Won', total: 4125.00 },
  { clientIdx: 10, companyIdx: 1, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Retail Bindings'], order_number: 'UB-1003', invoice_number: 'UB-INV-003', close_date: '3/1/2025', stage: 'Closed - Won', total: 6600.00 },
  { clientIdx: 8, companyIdx: 1, seasonId: 'us-2024-2025', order_type: 'Retail', retail_items: ['Retail Bindings'], order_number: 'UB-0901', invoice_number: 'UB-INV-004', close_date: '2/20/2024', stage: 'Closed - Won', total: 5500.00 },
  { clientIdx: 4, companyIdx: 1, seasonId: 'us-2024-2025', order_type: 'Retail', retail_items: ['Retail Bindings'], order_number: 'UB-0902', invoice_number: 'UB-INV-005', close_date: '3/5/2024', stage: 'Closed - Won', total: 7200.00 },
  // 686 Outerwear (company idx 2)
  { clientIdx: 4, companyIdx: 2, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Outerwear'], order_number: '686-2001', invoice_number: '686-INV-001', close_date: '1/20/2025', stage: 'Closed - Won', total: 12450.00 },
  { clientIdx: 6, companyIdx: 2, seasonId: 'us-2025-2026', order_type: 'Retail', retail_items: ['Outerwear'], order_number: '686-2002', invoice_number: '686-INV-002', close_date: '2/5/2025', stage: 'Closed - Won', total: 8900.00 },
  { clientIdx: 10, companyIdx: 2, seasonId: 'us-2024-2025', order_type: 'Retail', retail_items: ['Outerwear'], order_number: '686-1901', invoice_number: '686-INV-003', close_date: '1/15/2024', stage: 'Closed - Won', total: 15300.00 },
]

const todosData = [
  { companyIdx: 0, title: 'Follow up on rental order', note: 'They want to add boots to the order', clientIdx: 4, phone: '575-377-6401', due_date: '2026-01-15', completed: false },
  { companyIdx: 0, title: 'Send updated price list', note: 'New 2026-2027 pricing', clientIdx: 7, phone: '360-671-4615', due_date: '2026-02-10', completed: false },
  { companyIdx: 0, title: 'Collect PO for spring order', note: '', clientIdx: 10, phone: '413-339-6617', due_date: '2026-01-28', completed: true },
  { companyIdx: 1, title: 'Demo day follow-up', note: 'Interested in Force bindings', clientIdx: 4, phone: '575-377-6401', due_date: '2026-02-01', completed: false },
  { companyIdx: 2, title: 'Check on jacket warranty claim', note: 'Customer returned defective zipper', clientIdx: 6, phone: '928-779-1951', due_date: '2026-02-05', completed: false },
]

// ── Insert ─────────────────────────────────────────────────

async function seed() {
  console.log('Seeding for user:', userId)

  // Insert companies
  const { data: companyRows, error: companyErr } = await supabase
    .from('companies')
    .insert(companies.map((c) => ({ ...c, user_id: userId })))
    .select()
  if (companyErr) throw companyErr
  console.log(`Inserted ${companyRows.length} companies`)

  // Insert clients
  const { data: clientRows, error: clientErr } = await supabase
    .from('clients')
    .insert(clients.map((c) => ({ ...c, user_id: userId })))
    .select()
  if (clientErr) throw clientErr
  console.log(`Inserted ${clientRows.length} clients`)

  // Insert seasons
  const { data: seasonRows, error: seasonErr } = await supabase
    .from('seasons')
    .insert(seasons.map((s) => ({ ...s, user_id: userId })))
    .select()
  if (seasonErr) throw seasonErr
  console.log(`Inserted ${seasonRows.length} seasons`)

  // Insert orders (map indices to real IDs)
  const orderInserts = ordersData.map((o) => ({
    user_id: userId,
    client_id: clientRows[o.clientIdx].id,
    company_id: companyRows[o.companyIdx].id,
    season_id: o.seasonId,
    order_type: o.order_type,
    rental_items: o.rental_items || null,
    retail_items: o.retail_items || null,
    order_number: o.order_number,
    invoice_number: o.invoice_number,
    close_date: o.close_date,
    stage: o.stage,
    total: o.total,
  }))

  const { data: orderRows, error: orderErr } = await supabase
    .from('orders')
    .insert(orderInserts)
    .select()
  if (orderErr) throw orderErr
  console.log(`Inserted ${orderRows.length} orders`)

  // Insert commissions for Closed-Won orders
  const commissionInserts = orderRows
    .filter((o) => o.stage === 'Closed - Won')
    .map((o) => {
      const company = companyRows.find((c) => c.id === o.company_id)
      const pct = company?.commission_percent || 0
      const due = o.total * (pct / 100)
      return {
        user_id: userId,
        order_id: o.id,
        commission_due: due,
        pay_status: 'pending invoice',
        amount_paid: 0,
        paid_date: null,
        amount_remaining: due,
      }
    })

  const { data: commRows, error: commErr } = await supabase
    .from('commissions')
    .insert(commissionInserts)
    .select()
  if (commErr) throw commErr
  console.log(`Inserted ${commRows.length} commissions`)

  // Insert todos
  const todoInserts = todosData.map((t, i) => ({
    user_id: userId,
    company_id: companyRows[t.companyIdx].id,
    client_id: t.clientIdx != null ? clientRows[t.clientIdx].id : null,
    title: t.title,
    note: t.note,
    phone: t.phone,
    due_date: t.due_date,
    completed: t.completed,
    completed_at: t.completed ? '2026-01-27' : null,
    pinned: false,
    sort_order: i,
  }))

  const { data: todoRows, error: todoErr } = await supabase
    .from('todos')
    .insert(todoInserts)
    .select()
  if (todoErr) throw todoErr
  console.log(`Inserted ${todoRows.length} todos`)

  console.log('Seed complete!')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
