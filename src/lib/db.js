import { supabase, AUTH_STORAGE_KEY } from './supabase'

// Read the session expiry directly from localStorage.
// This avoids calling getSession() which can hang after tab switches
// (see supabase.js comments for the full explanation).
function getStoredExpiry() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) return null
    const { expires_at } = JSON.parse(stored)
    return expires_at || null
  } catch {
    return null
  }
}

// Ensure the JWT is fresh before making a DB call.
// Reads expiry from localStorage (instant) and only calls refreshSession()
// if we're within 5 minutes of expiry. Has a 5s bail-out timeout.
async function ensureFreshSession() {
  try {
    const expiresAt = getStoredExpiry()
    if (!expiresAt) return
    const fiveMinFromNow = Math.floor(Date.now() / 1000) + 300
    if (expiresAt < fiveMinFromNow) {
      await Promise.race([
        supabase.auth.refreshSession(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ])
    }
  } catch {
    // If refresh fails, proceed anyway — the token might still work
  }
}

// Wrap a Supabase call with session refresh, timeout, and auto-retry.
// The custom fetch in supabase.js uses AbortController to properly cancel
// hung requests (clearing dead TCP connections), so retries get fresh connections.
async function withTimeout(buildQuery, ms = 20000) {
  await ensureFreshSession()
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await Promise.race([
        buildQuery(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out — please try again.')), ms)),
      ])
    } catch (err) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        continue
      }
      throw err
    }
  }
}

// ── Companies ──────────────────────────────────────────────

export async function fetchCompanies() {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function insertCompany(company) {
  const { data, error } = await supabase
    .from('companies')
    .insert(company)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCompany(id, updates) {
  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCompany(id) {
  const { error } = await supabase.from('companies').delete().eq('id', id)
  if (error) throw error
}

export async function updateCompanySortOrders(updates) {
  // updates is an array of { id, sort_order }
  const promises = updates.map(({ id, sort_order }) =>
    supabase.from('companies').update({ sort_order }).eq('id', id)
  )
  const results = await Promise.all(promises)
  const firstError = results.find((r) => r.error)
  if (firstError?.error) throw firstError.error
}

// ── Accounts ──────────────────────────────────────────────

export async function fetchAccounts() {
  const rows = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

export async function insertAccount(account) {
  const { data, error } = await supabase
    .from('clients')
    .insert(account)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function bulkInsertAccounts(accounts) {
  const { data, error } = await supabase
    .from('clients')
    .insert(accounts)
    .select()
  if (error) throw error
  return data
}

export async function updateAccount(id, updates) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAccount(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
}

// ── Seasons ────────────────────────────────────────────────

export async function fetchSeasons() {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function insertSeason(season) {
  const { data, error } = await supabase
    .from('seasons')
    .insert(season)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSeason(id, updates) {
  const { data, error } = await supabase
    .from('seasons')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSeason(id) {
  const { error } = await supabase.from('seasons').delete().eq('id', id)
  if (error) throw error
}

// ── Orders ─────────────────────────────────────────────────

export async function fetchOrders() {
  const rows = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

export async function insertOrder(order) {
  const { data, error } = await withTimeout(
    () => supabase.from('orders').insert(order).select().single()
  )
  if (error) throw error
  return data
}

export async function bulkInsertOrders(orders) {
  const { data, error } = await withTimeout(
    () => supabase.from('orders').insert(orders).select()
  )
  if (error) throw error
  return data
}

export async function updateOrder(id, updates) {
  const { data, error } = await withTimeout(
    () => supabase.from('orders').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteOrder(id) {
  // Delete associated commission first (FK has no CASCADE)
  await supabase.from('commissions').delete().eq('order_id', id)
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) throw error
}

// ── Commissions ────────────────────────────────────────────

export async function fetchCommissions() {
  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function upsertCommission(commission) {
  const { data, error } = await supabase
    .from('commissions')
    .upsert(commission, { onConflict: 'order_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCommission(id, updates) {
  const { data, error } = await supabase
    .from('commissions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Todos ──────────────────────────────────────────────────

export async function fetchTodos() {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function insertTodo(todo) {
  const { data, error } = await supabase
    .from('todos')
    .insert(todo)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTodo(id, updates) {
  const { data, error } = await supabase
    .from('todos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTodo(id) {
  const { error } = await supabase.from('todos').delete().eq('id', id)
  if (error) throw error
}

export async function updateTodoSortOrders(updates) {
  const promises = updates.map(({ id, sort_order }) =>
    supabase.from('todos').update({ sort_order }).eq('id', id)
  )
  const results = await Promise.all(promises)
  const firstError = results.find((r) => r.error)
  if (firstError?.error) throw firstError.error
}

// ── Subscriptions ─────────────────────────────────────────

export async function fetchSubscription(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data || null
}

// ── Storage ────────────────────────────────────────────────

export async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file)
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
  return publicUrl
}

export async function uploadLogo(userId, companyId, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${companyId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('logos').upload(path, file)
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
  return publicUrl
}

export async function uploadDocument(userId, orderId, type, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${orderId}/${type}/${Date.now()}.${ext}`
  await ensureFreshSession()
  // The custom fetch in supabase.js gives uploads a 60s AbortController timeout,
  // properly cancelling hung requests on dead connections. 3 retries with delay.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await supabase.storage.from('documents').upload(path, file)
      if (result.error) throw result.error
      return { name: file.name, path: result.data.path }
    } catch (err) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        continue
      }
      throw err
    }
  }
}

export async function getDocumentUrl(path) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}
