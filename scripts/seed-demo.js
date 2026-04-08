/**
 * Seed script for demo user: demo@repcommish.com
 * Creates realistic brands, accounts, seasons, orders, commissions, and todos.
 *
 * Usage: SUPABASE_SERVICE_KEY=... node scripts/seed-demo.js
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mybzeehqbecuzjgmxpvn.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseServiceKey) { console.error('Missing SUPABASE_SERVICE_KEY'); process.exit(1) }

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// ── Step 1: Create auth user ──────────────────────────────
async function createUser() {
  // Check if user already exists
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const existing = users.find(u => u.email === 'demo@repcommish.com')
  if (existing) {
    console.log('Demo user already exists:', existing.id)
    return existing.id
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'demo@repcommish.com',
    password: 'Password1',
    email_confirm: true,
    user_metadata: { full_name: 'Alex Demo' },
  })
  if (error) throw error
  console.log('Created user:', data.user.id)
  return data.user.id
}

// ── Seed Data ─────────────────────────────────────────────

const companies = [
  {
    name: 'Peak Outerwear',
    commission_percent: 8,
    logo_path: null,
    archived: false,
    sort_order: 0,
    order_types: ['Retail', 'Rental'],
    items: ['Jackets', 'Pants', 'Base Layers', 'Gloves', 'Accessories'],
    stages: ['Order Placed', 'Invoiced', 'Shipped', 'Partially Shipped'],
  },
  {
    name: 'Summit Skis',
    commission_percent: 5,
    logo_path: null,
    archived: false,
    sort_order: 1,
    order_types: ['Retail', 'Rental', 'Demo'],
    items: ['Skis', 'Boots', 'Poles', 'Bindings', 'Helmets'],
    stages: ['Order Placed', 'Invoiced', 'Shipped', 'Partially Shipped'],
  },
  {
    name: 'Frostline Bindings',
    commission_percent: 10,
    logo_path: null,
    archived: false,
    sort_order: 2,
    order_types: ['Retail'],
    items: ['Bindings', 'Binding Parts', 'Accessories'],
    stages: ['Order Placed', 'Invoiced', 'Shipped'],
  },
]

const clients = [
  { name: 'Mountain Creek Resort', account_number: 'MC-10001', region: 'Mid Atlantic', type: 'Resort', city: 'Vernon', state: 'NJ' },
  { name: 'Powder House Ski Shop', account_number: 'PH-10002', region: 'New England', type: 'Ski Shop (Off Site)', city: 'South Portland', state: 'ME' },
  { name: 'Aspen Ski & Board', account_number: 'AS-10003', region: 'Rockies', type: 'Ski Shop (Off Site)', city: 'Aspen', state: 'CO' },
  { name: 'Tahoe Sports Hub', account_number: 'TH-10004', region: 'PNW', type: 'Ski Shop (Off Site)', city: 'Truckee', state: 'CA' },
  { name: 'Snowbird Resort', account_number: 'SB-10005', region: 'Rockies', type: 'Resort', city: 'Snowbird', state: 'UT' },
  { name: 'Stowe Mountain Lodge', account_number: 'SM-10006', region: 'New England', type: 'Resort', city: 'Stowe', state: 'VT' },
  { name: 'Timber Ridge Outfitters', account_number: 'TR-10007', region: 'Midwest', type: 'Ski Shop (Off Site)', city: 'Traverse City', state: 'MI' },
  { name: 'Big Sky Rentals', account_number: 'BS-10008', region: 'Rockies', type: 'Resort', city: 'Big Sky', state: 'MT' },
  { name: 'Crystal Peaks Ski Co', account_number: 'CP-10009', region: 'PNW', type: 'Chain', city: 'Bend', state: 'OR' },
  { name: 'Whiteface Mountain Shop', account_number: 'WF-10010', region: 'Mid Atlantic', type: 'Resort', city: 'Wilmington', state: 'NY' },
  { name: 'Alpine Edge Sports', account_number: 'AE-10011', region: 'Rockies', type: 'Ski Shop (Off Site)', city: 'Breckenridge', state: 'CO' },
  { name: 'Sugarloaf Ski Shop', account_number: 'SL-10012', region: 'New England', type: 'Resort', city: 'Carrabassett Valley', state: 'ME' },
  { name: 'Copper Mountain Gear', account_number: 'CM-10013', region: 'Rockies', type: 'Resort', city: 'Frisco', state: 'CO' },
  { name: 'North Shore Ski & Cycle', account_number: 'NS-10014', region: 'Midwest', type: 'Ski Shop (Off Site)', city: 'Duluth', state: 'MN' },
  { name: 'Whistler Sports Exchange', account_number: 'WS-10015', region: 'PNW', type: 'Ski Shop (Off Site)', city: 'Whistler', state: 'BC' },
  { name: 'Mount Baker Rentals', account_number: 'MB-10016', region: 'PNW', type: 'Resort', city: 'Deming', state: 'WA' },
  { name: 'Black Diamond Outfitters', account_number: 'BD-10017', region: 'Southeast', type: 'Ski Shop (Off Site)', city: 'Banner Elk', state: 'NC' },
  { name: 'Vail Valley Sports', account_number: 'VV-10018', region: 'Rockies', type: 'Chain', city: 'Vail', state: 'CO' },
]

// Seasons: 2 years per brand, US + CA, with sale_cycle labels
function buildSeasons(companyIdx) {
  const prefixes = ['us', 'ca']
  const years = [
    { year: '2024-2025', cycle: '2024-2025', archived: false },
    { year: '2025-2026', cycle: '2025-2026', archived: false },
  ]
  return prefixes.flatMap(p =>
    years.map(y => ({
      id: `demo-${p}-${y.year}-c${companyIdx}`,
      label: `${p.toUpperCase()} ${y.year}`,
      country: p.toUpperCase(),
      year: y.year,
      sale_cycle: y.cycle,
      archived: y.archived,
      companyIdx,
    }))
  )
}

const allSeasons = [
  ...buildSeasons(0),
  ...buildSeasons(1),
  ...buildSeasons(2),
]

// ── Orders ────────────────────────────────────────────────
// Mix of stages, types, dates, and amounts
const ordersData = [
  // ── Peak Outerwear (companyIdx 0, 8%) ──
  // US 2025-2026
  { clientIdx: 0,  companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Jackets', 'Pants'],            order_number: 'PK-5001', close_date: '2025-09-15', stage: 'Shipped',         total: 14250.00, sale_type: 'Pre-Book' },
  { clientIdx: 1,  companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Jackets', 'Gloves'],           order_number: 'PK-5002', close_date: '2025-10-01', stage: 'Shipped',         total: 8430.00,  sale_type: 'Pre-Book' },
  { clientIdx: 2,  companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Jackets', 'Pants', 'Base Layers'], order_number: 'PK-5003', close_date: '2025-11-20', stage: 'Shipped',    total: 22100.00, sale_type: 'Pre-Book' },
  { clientIdx: 3,  companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Pants', 'Accessories'],        order_number: 'PK-5004', close_date: '2025-12-05', stage: 'Invoiced',        total: 5670.00,  sale_type: 'At Once' },
  { clientIdx: 4,  companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Jackets'],                     order_number: 'PK-5005', close_date: '2026-01-10', stage: 'Shipped',         total: 18900.00, sale_type: 'At Once' },
  { clientIdx: 5,  companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Rental',  items: ['Jackets', 'Pants'],            order_number: 'PK-5006', close_date: '2025-10-22', stage: 'Shipped',         total: 6200.00,  sale_type: 'Pre-Book' },
  { clientIdx: 6,  companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Gloves', 'Accessories'],       order_number: 'PK-5007', close_date: '2026-01-28', stage: 'Order Placed',    total: 3450.00,  sale_type: 'At Once' },
  { clientIdx: 10, companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Jackets', 'Pants'],            order_number: 'PK-5008', close_date: '2025-09-30', stage: 'Shipped',         total: 11800.00, sale_type: 'Pre-Book' },
  { clientIdx: 11, companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Jackets', 'Base Layers'],      order_number: 'PK-5009', close_date: '2025-11-15', stage: 'Shipped',         total: 9350.00,  sale_type: 'Pre-Book' },
  { clientIdx: 17, companyIdx: 0, seasonId: 'demo-us-2025-2026-c0', order_type: 'Retail',  items: ['Jackets', 'Pants', 'Gloves'],  order_number: 'PK-5010', close_date: '2025-08-20', stage: 'Shipped',         total: 31500.00, sale_type: 'Pre-Book' },
  // CA 2025-2026
  { clientIdx: 14, companyIdx: 0, seasonId: 'demo-ca-2025-2026-c0', order_type: 'Retail',  items: ['Jackets', 'Pants'],            order_number: 'PK-5011', close_date: '2025-09-10', stage: 'Shipped',         total: 16400.00, sale_type: 'Pre-Book' },
  { clientIdx: 15, companyIdx: 0, seasonId: 'demo-ca-2025-2026-c0', order_type: 'Rental',  items: ['Jackets'],                     order_number: 'PK-5012', close_date: '2025-11-01', stage: 'Shipped',         total: 4800.00,  sale_type: 'Pre-Book' },
  // US 2024-2025 (prior year)
  { clientIdx: 0,  companyIdx: 0, seasonId: 'demo-us-2024-2025-c0', order_type: 'Retail',  items: ['Jackets', 'Pants'],            order_number: 'PK-4001', close_date: '2024-09-10', stage: 'Shipped',         total: 12600.00, sale_type: 'Pre-Book' },
  { clientIdx: 2,  companyIdx: 0, seasonId: 'demo-us-2024-2025-c0', order_type: 'Retail',  items: ['Jackets'],                     order_number: 'PK-4002', close_date: '2024-10-15', stage: 'Shipped',         total: 19400.00, sale_type: 'Pre-Book' },
  { clientIdx: 4,  companyIdx: 0, seasonId: 'demo-us-2024-2025-c0', order_type: 'Retail',  items: ['Pants', 'Accessories'],        order_number: 'PK-4003', close_date: '2024-11-22', stage: 'Shipped',         total: 7250.00,  sale_type: 'At Once' },
  { clientIdx: 17, companyIdx: 0, seasonId: 'demo-us-2024-2025-c0', order_type: 'Retail',  items: ['Jackets', 'Pants', 'Gloves'],  order_number: 'PK-4004', close_date: '2024-08-30', stage: 'Shipped',         total: 28900.00, sale_type: 'Pre-Book' },

  // ── Summit Skis (companyIdx 1, 5%) ──
  // US 2025-2026
  { clientIdx: 0,  companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Rental',  items: ['Skis', 'Boots', 'Poles'],      order_number: 'SS-3001', close_date: '2025-08-15', stage: 'Shipped',         total: 42500.00, sale_type: 'Pre-Book' },
  { clientIdx: 2,  companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Retail',  items: ['Skis', 'Bindings'],            order_number: 'SS-3002', close_date: '2025-09-20', stage: 'Shipped',         total: 18750.00, sale_type: 'Pre-Book' },
  { clientIdx: 4,  companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Rental',  items: ['Skis', 'Boots', 'Bindings', 'Helmets'], order_number: 'SS-3003', close_date: '2025-10-05', stage: 'Shipped', total: 56200.00, sale_type: 'Pre-Book' },
  { clientIdx: 5,  companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Retail',  items: ['Skis', 'Poles'],               order_number: 'SS-3004', close_date: '2025-11-10', stage: 'Shipped',         total: 8900.00,  sale_type: 'Pre-Book' },
  { clientIdx: 7,  companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Rental',  items: ['Skis', 'Boots'],               order_number: 'SS-3005', close_date: '2025-12-01', stage: 'Invoiced',        total: 33400.00, sale_type: 'Pre-Book' },
  { clientIdx: 8,  companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Retail',  items: ['Skis', 'Bindings', 'Helmets'], order_number: 'SS-3006', close_date: '2026-01-15', stage: 'Order Placed',    total: 15600.00, sale_type: 'At Once' },
  { clientIdx: 9,  companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Demo',    items: ['Skis', 'Boots', 'Bindings'],   order_number: 'SS-3007', close_date: '2026-02-01', stage: 'Order Placed',    total: 7200.00,  sale_type: 'At Once' },
  { clientIdx: 12, companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Rental',  items: ['Skis', 'Boots', 'Poles'],      order_number: 'SS-3008', close_date: '2025-09-01', stage: 'Shipped',         total: 28350.00, sale_type: 'Pre-Book' },
  { clientIdx: 13, companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Retail',  items: ['Boots', 'Helmets'],            order_number: 'SS-3009', close_date: '2025-10-20', stage: 'Shipped',         total: 6100.00,  sale_type: 'Pre-Book' },
  { clientIdx: 16, companyIdx: 1, seasonId: 'demo-us-2025-2026-c1', order_type: 'Retail',  items: ['Skis'],                        order_number: 'SS-3010', close_date: '2026-01-05', stage: 'Partially Shipped', total: 4500.00, sale_type: 'At Once' },
  // CA 2025-2026
  { clientIdx: 14, companyIdx: 1, seasonId: 'demo-ca-2025-2026-c1', order_type: 'Retail',  items: ['Skis', 'Boots', 'Bindings'],   order_number: 'SS-3011', close_date: '2025-09-05', stage: 'Shipped',         total: 21000.00, sale_type: 'Pre-Book' },
  { clientIdx: 15, companyIdx: 1, seasonId: 'demo-ca-2025-2026-c1', order_type: 'Rental',  items: ['Skis', 'Boots'],               order_number: 'SS-3012', close_date: '2025-10-15', stage: 'Shipped',         total: 14800.00, sale_type: 'Pre-Book' },
  // US 2024-2025
  { clientIdx: 0,  companyIdx: 1, seasonId: 'demo-us-2024-2025-c1', order_type: 'Rental',  items: ['Skis', 'Boots'],               order_number: 'SS-2001', close_date: '2024-08-20', stage: 'Shipped',         total: 38200.00, sale_type: 'Pre-Book' },
  { clientIdx: 4,  companyIdx: 1, seasonId: 'demo-us-2024-2025-c1', order_type: 'Rental',  items: ['Skis', 'Boots', 'Bindings'],   order_number: 'SS-2002', close_date: '2024-09-15', stage: 'Shipped',         total: 48500.00, sale_type: 'Pre-Book' },
  { clientIdx: 12, companyIdx: 1, seasonId: 'demo-us-2024-2025-c1', order_type: 'Rental',  items: ['Skis', 'Boots'],               order_number: 'SS-2003', close_date: '2024-10-10', stage: 'Shipped',         total: 22100.00, sale_type: 'Pre-Book' },

  // ── Frostline Bindings (companyIdx 2, 10%) ──
  // US 2025-2026
  { clientIdx: 2,  companyIdx: 2, seasonId: 'demo-us-2025-2026-c2', order_type: 'Retail',  items: ['Bindings'],                    order_number: 'FL-7001', close_date: '2025-09-25', stage: 'Shipped',         total: 9800.00,  sale_type: 'Pre-Book' },
  { clientIdx: 4,  companyIdx: 2, seasonId: 'demo-us-2025-2026-c2', order_type: 'Retail',  items: ['Bindings', 'Binding Parts'],   order_number: 'FL-7002', close_date: '2025-10-10', stage: 'Shipped',         total: 14200.00, sale_type: 'Pre-Book' },
  { clientIdx: 7,  companyIdx: 2, seasonId: 'demo-us-2025-2026-c2', order_type: 'Retail',  items: ['Bindings'],                    order_number: 'FL-7003', close_date: '2025-11-05', stage: 'Shipped',         total: 7650.00,  sale_type: 'Pre-Book' },
  { clientIdx: 10, companyIdx: 2, seasonId: 'demo-us-2025-2026-c2', order_type: 'Retail',  items: ['Bindings', 'Accessories'],     order_number: 'FL-7004', close_date: '2025-12-15', stage: 'Invoiced',        total: 5400.00,  sale_type: 'At Once' },
  { clientIdx: 11, companyIdx: 2, seasonId: 'demo-us-2025-2026-c2', order_type: 'Retail',  items: ['Bindings'],                    order_number: 'FL-7005', close_date: '2026-01-20', stage: 'Order Placed',    total: 3200.00,  sale_type: 'At Once' },
  { clientIdx: 17, companyIdx: 2, seasonId: 'demo-us-2025-2026-c2', order_type: 'Retail',  items: ['Bindings', 'Binding Parts'],   order_number: 'FL-7006', close_date: '2025-08-15', stage: 'Shipped',         total: 21000.00, sale_type: 'Pre-Book' },
  // US 2024-2025
  { clientIdx: 2,  companyIdx: 2, seasonId: 'demo-us-2024-2025-c2', order_type: 'Retail',  items: ['Bindings'],                    order_number: 'FL-6001', close_date: '2024-09-20', stage: 'Shipped',         total: 8400.00,  sale_type: 'Pre-Book' },
  { clientIdx: 4,  companyIdx: 2, seasonId: 'demo-us-2024-2025-c2', order_type: 'Retail',  items: ['Bindings', 'Binding Parts'],   order_number: 'FL-6002', close_date: '2024-10-05', stage: 'Shipped',         total: 12600.00, sale_type: 'Pre-Book' },
  { clientIdx: 17, companyIdx: 2, seasonId: 'demo-us-2024-2025-c2', order_type: 'Retail',  items: ['Bindings'],                    order_number: 'FL-6003', close_date: '2024-08-25', stage: 'Shipped',         total: 18500.00, sale_type: 'Pre-Book' },
]

// Commission scenarios: mix of paid, partial, pending
// key: order_number -> commission override
const commissionScenarios = {
  // Peak Outerwear — current season
  'PK-5001': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-15', payments: [{ amount: 1140.00, date: '2026-01-15' }] },
  'PK-5002': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2025-12-20', payments: [{ amount: 674.40, date: '2025-12-20' }] },
  'PK-5003': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-02-01', payments: [{ amount: 1768.00, date: '2026-02-01' }] },
  'PK-5004': { pay_status: 'invoiced',        paidPct: 0,   paid_date: null },
  'PK-5005': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-02-15', payments: [{ amount: 1512.00, date: '2026-02-15' }] },
  'PK-5006': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-10', payments: [{ amount: 496.00, date: '2026-01-10' }] },
  'PK-5007': { pay_status: 'pending invoice', paidPct: 0,   paid_date: null },
  'PK-5008': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-05', payments: [{ amount: 944.00, date: '2026-01-05' }] },
  'PK-5009': { pay_status: 'invoiced',        paidPct: 0,   paid_date: null },
  'PK-5010': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2025-11-20', payments: [{ amount: 2520.00, date: '2025-11-20' }] },
  'PK-5011': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-10', payments: [{ amount: 1312.00, date: '2026-01-10' }] },
  'PK-5012': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-25', payments: [{ amount: 384.00, date: '2026-01-25' }] },
  // Peak prior year — all paid
  'PK-4001': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-01-10', payments: [{ amount: 1008.00, date: '2025-01-10' }] },
  'PK-4002': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-02-05', payments: [{ amount: 1552.00, date: '2025-02-05' }] },
  'PK-4003': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-02-20', payments: [{ amount: 580.00, date: '2025-02-20' }] },
  'PK-4004': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-01-15', payments: [{ amount: 2312.00, date: '2025-01-15' }] },

  // Summit Skis — current season
  'SS-3001': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2025-12-01', payments: [{ amount: 2125.00, date: '2025-12-01' }] },
  'SS-3002': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-10', payments: [{ amount: 937.50, date: '2026-01-10' }] },
  'SS-3003': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-20', payments: [{ amount: 1405.00, date: '2025-12-15' }, { amount: 1405.00, date: '2026-01-20' }] },
  'SS-3004': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-02-10', payments: [{ amount: 445.00, date: '2026-02-10' }] },
  'SS-3005': { pay_status: 'invoiced',        paidPct: 0,   paid_date: null },
  'SS-3006': { pay_status: 'pending invoice', paidPct: 0,   paid_date: null },
  'SS-3007': { pay_status: 'pending invoice', paidPct: 0,   paid_date: null },
  'SS-3008': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2025-12-15', payments: [{ amount: 1417.50, date: '2025-12-15' }] },
  'SS-3009': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-15', payments: [{ amount: 305.00, date: '2026-01-15' }] },
  'SS-3010': { pay_status: 'pending invoice', paidPct: 0,   paid_date: null },
  'SS-3011': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-05', payments: [{ amount: 1050.00, date: '2026-01-05' }] },
  'SS-3012': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-02-01', payments: [{ amount: 740.00, date: '2026-02-01' }] },
  // Summit prior year — all paid
  'SS-2001': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-01-05', payments: [{ amount: 1910.00, date: '2025-01-05' }] },
  'SS-2002': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-02-10', payments: [{ amount: 2425.00, date: '2025-02-10' }] },
  'SS-2003': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-01-20', payments: [{ amount: 1105.00, date: '2025-01-20' }] },

  // Frostline Bindings — current season
  'FL-7001': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-10', payments: [{ amount: 980.00, date: '2026-01-10' }] },
  'FL-7002': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-01-25', payments: [{ amount: 1420.00, date: '2026-01-25' }] },
  'FL-7003': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2026-02-05', payments: [{ amount: 765.00, date: '2026-02-05' }] },
  'FL-7004': { pay_status: 'invoiced',        paidPct: 0,   paid_date: null },
  'FL-7005': { pay_status: 'pending invoice', paidPct: 0,   paid_date: null },
  'FL-7006': { pay_status: 'paid',            paidPct: 1.0, paid_date: '2025-11-15', payments: [{ amount: 2100.00, date: '2025-11-15' }] },
  // Frostline prior year — all paid
  'FL-6001': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-01-15', payments: [{ amount: 840.00, date: '2025-01-15' }] },
  'FL-6002': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-02-10', payments: [{ amount: 1260.00, date: '2025-02-10' }] },
  'FL-6003': { pay_status: 'paid', paidPct: 1.0, paid_date: '2025-01-05', payments: [{ amount: 1850.00, date: '2025-01-05' }] },
}

const todosData = [
  { companyIdx: 0, clientIdx: 0,  title: 'Send updated price list for Spring restock',   note: 'They want to see new jacket colors', phone: '973-827-2000', due_date: '2026-03-01', completed: false, pinned: true },
  { companyIdx: 0, clientIdx: 3,  title: 'Follow up on At Once order PK-5004',           note: 'Invoice sent, waiting on payment',   phone: '530-587-6661', due_date: '2026-02-28', completed: false, pinned: false },
  { companyIdx: 0, clientIdx: 6,  title: 'Confirm order quantities for PK-5007',         note: '',                                   phone: '231-947-2770', due_date: '2026-03-05', completed: false, pinned: false },
  { companyIdx: 1, clientIdx: 7,  title: 'Check invoice status for SS-3005',             note: 'Invoiced but not yet paid — follow up', phone: '406-995-5769', due_date: '2026-02-25', completed: false, pinned: true },
  { companyIdx: 1, clientIdx: 8,  title: 'Send demo day follow-up',                      note: 'Interested in new all-mountain line', phone: '541-382-6977', due_date: '2026-03-10', completed: false, pinned: false },
  { companyIdx: 1, clientIdx: 4,  title: 'Schedule spring inventory check',              note: 'Rental fleet review',                phone: '801-933-2222', due_date: '2026-04-01', completed: false, pinned: false },
  { companyIdx: 2, clientIdx: 10, title: 'Process warranty replacement',                  note: 'Broken buckle on 3 pairs',           phone: '970-453-2194', due_date: '2026-02-20', completed: true,  pinned: false },
  { companyIdx: 2, clientIdx: 17, title: 'Confirm Vail reorder for FL-7006',             note: 'They may want to double the order',  phone: '970-476-1310', due_date: '2026-03-15', completed: false, pinned: false },
]

// ── Insert ─────────────────────────────────────────────────

async function seed() {
  const userId = await createUser()
  console.log('Seeding for user:', userId)

  // Give the user a pro subscription so they have full access
  const { error: subErr } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: 'cus_demo_000',
    stripe_subscription_id: 'sub_demo_000',
    plan: 'pro',
    status: 'active',
    current_period_end: '2027-12-31T00:00:00Z',
    cancel_at_period_end: false,
  }, { onConflict: 'user_id' })
  if (subErr) console.warn('Subscription upsert warning:', subErr.message)
  else console.log('Set pro subscription')

  // Companies
  const { data: companyRows, error: companyErr } = await supabase
    .from('companies')
    .insert(companies.map(c => ({ ...c, user_id: userId })))
    .select()
  if (companyErr) throw companyErr
  console.log(`Inserted ${companyRows.length} companies`)

  // Clients
  const { data: clientRows, error: clientErr } = await supabase
    .from('clients')
    .insert(clients.map(c => ({ ...c, user_id: userId })))
    .select()
  if (clientErr) throw clientErr
  console.log(`Inserted ${clientRows.length} clients`)

  // Seasons — map companyIdx to real company ID
  const seasonInserts = allSeasons.map(s => ({
    id: s.id,
    user_id: userId,
    label: s.label,
    company_id: companyRows[s.companyIdx].id,
    country: s.country,
    year: s.year,
    sale_cycle: s.sale_cycle,
    archived: s.archived,
  }))
  const { data: seasonRows, error: seasonErr } = await supabase
    .from('seasons')
    .insert(seasonInserts)
    .select()
  if (seasonErr) throw seasonErr
  console.log(`Inserted ${seasonRows.length} seasons`)

  // Orders
  const orderInserts = ordersData.map(o => ({
    user_id: userId,
    client_id: clientRows[o.clientIdx].id,
    company_id: companyRows[o.companyIdx].id,
    season_id: o.seasonId,
    order_type: o.order_type,
    items: o.items,
    order_number: o.order_number,
    close_date: o.close_date,
    stage: o.stage,
    total: o.total,
    sale_type: o.sale_type,
  }))
  const { data: orderRows, error: orderErr } = await supabase
    .from('orders')
    .insert(orderInserts)
    .select()
  if (orderErr) throw orderErr
  console.log(`Inserted ${orderRows.length} orders`)

  // Commissions
  const commissionInserts = orderRows.map(o => {
    const company = companyRows.find(c => c.id === o.company_id)
    const pct = company?.commission_percent || 0
    const due = Math.round(o.total * (pct / 100) * 100) / 100
    const scenario = commissionScenarios[o.order_number] || { pay_status: 'pending invoice', paidPct: 0, paid_date: null }
    const amount_paid = Math.round(due * scenario.paidPct * 100) / 100
    const amount_remaining = Math.round((due - amount_paid) * 100) / 100

    return {
      user_id: userId,
      order_id: o.id,
      commission_due: due,
      pay_status: scenario.pay_status,
      amount_paid,
      paid_date: scenario.paid_date,
      amount_remaining,
      payments: scenario.payments || [],
    }
  })

  const { data: commRows, error: commErr } = await supabase
    .from('commissions')
    .insert(commissionInserts)
    .select()
  if (commErr) throw commErr
  console.log(`Inserted ${commRows.length} commissions`)

  // Todos
  const todoInserts = todosData.map((t, i) => ({
    user_id: userId,
    company_id: companyRows[t.companyIdx].id,
    client_id: t.clientIdx != null ? clientRows[t.clientIdx].id : null,
    title: t.title,
    note: t.note,
    phone: t.phone,
    due_date: t.due_date,
    completed: t.completed,
    completed_at: t.completed ? '2026-02-18' : null,
    pinned: t.pinned,
    sort_order: i,
  }))

  const { data: todoRows, error: todoErr } = await supabase
    .from('todos')
    .insert(todoInserts)
    .select()
  if (todoErr) throw todoErr
  console.log(`Inserted ${todoRows.length} todos`)

  // Summary
  const totalSales = ordersData.reduce((s, o) => s + o.total, 0)
  const totalComm = commissionInserts.reduce((s, c) => s + c.commission_due, 0)
  const totalPaid = commissionInserts.reduce((s, c) => s + c.amount_paid, 0)
  console.log(`\nDemo seed complete!`)
  console.log(`  ${companyRows.length} brands, ${clientRows.length} accounts, ${seasonRows.length} seasons`)
  console.log(`  ${orderRows.length} orders ($${totalSales.toLocaleString()} total sales)`)
  console.log(`  ${commRows.length} commissions ($${totalComm.toLocaleString()} due, $${totalPaid.toLocaleString()} paid)`)
  console.log(`  ${todoRows.length} todos`)
  console.log(`\nLogin: demo@repcommish.com / Password1`)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
