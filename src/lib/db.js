import { supabase } from './supabase'

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

export async function updateCompanySortOrders(updates) {
  // updates is an array of { id, sort_order }
  const promises = updates.map(({ id, sort_order }) =>
    supabase.from('companies').update({ sort_order }).eq('id', id)
  )
  const results = await Promise.all(promises)
  const firstError = results.find((r) => r.error)
  if (firstError?.error) throw firstError.error
}

// ── Clients ────────────────────────────────────────────────

export async function fetchClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

export async function insertClient(client) {
  const { data, error } = await supabase
    .from('clients')
    .insert(client)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateClient(id, updates) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteClient(id) {
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

// ── Orders ─────────────────────────────────────────────────

export async function fetchOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertOrder(order) {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateOrder(id, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteOrder(id) {
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

// ── Storage ────────────────────────────────────────────────

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
  const { data, error } = await supabase.storage.from('documents').upload(path, file)
  if (error) throw error
  return { name: file.name, path: data.path }
}

export async function getDocumentUrl(path) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}
