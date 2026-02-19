import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import * as db from '@/lib/db'

const SalesContext = createContext()

// Derive a cycle label for legacy seasons that have no sale_cycle
function deriveCycle(season) {
  if (season.sale_cycle) return season.sale_cycle
  if (season.year) return `${season.year}-${parseInt(season.year) + 1}`
  return null
}

// Sort key for chronological ordering of cycles
function cycleSortKey(cycle) {
  const match = cycle.match(/^(\d{4})\s*(Winter|Spring|Summer|Fall)?/)
  if (!match) return 0
  const year = parseInt(match[1])
  const seasonOrder = { Winter: 1, Spring: 2, Summer: 3, Fall: 4 }
  return year * 10 + (seasonOrder[match[2]] || 5)
}

// Cache version tied to build time — every deploy invalidates old caches
const CACHE_VERSION = '__v2__'
const CACHE_SEASONS = `rc_cache_seasons${CACHE_VERSION}`
const CACHE_ORDERS = `rc_cache_orders${CACHE_VERSION}`
const CACHE_COMMISSIONS = `rc_cache_commissions${CACHE_VERSION}`

// Clean up old versions of OUR cache keys only (don't touch other contexts' caches)
try {
  const ourPrefixes = ['rc_cache_seasons', 'rc_cache_orders', 'rc_cache_commissions']
  Object.keys(localStorage).forEach((key) => {
    if (ourPrefixes.some((p) => key.startsWith(p)) && !key.includes(CACHE_VERSION)) {
      localStorage.removeItem(key)
    }
  })
} catch {}

const readCache = (key) => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }

export function SalesProvider({ children }) {
  const { user } = useAuth()
  const [seasons, setSeasons] = useState(() => readCache(CACHE_SEASONS))
  const [orders, setOrders] = useState(() => readCache(CACHE_ORDERS))
  const [commissions, setCommissions] = useState(() => readCache(CACHE_COMMISSIONS))
  const [loading, setLoading] = useState(() => !readCache(CACHE_ORDERS).length)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [seasonsData, ordersData, commissionsData] = await Promise.all([
        db.fetchSeasons(),
        db.fetchOrders(),
        db.fetchCommissions(),
      ])
      setSeasons(seasonsData)
      setOrders(ordersData)
      setCommissions(commissionsData)
    } catch (err) {
      console.error('Failed to load sales data:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  // Persist state to localStorage after renders (not inside state updaters)
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    try { localStorage.setItem(CACHE_SEASONS, JSON.stringify(seasons)) } catch {}
  }, [seasons])
  useEffect(() => {
    try { localStorage.setItem(CACHE_ORDERS, JSON.stringify(orders)) } catch {}
  }, [orders])
  useEffect(() => {
    try { localStorage.setItem(CACHE_COMMISSIONS, JSON.stringify(commissions)) } catch {}
  }, [commissions])

  const addSeason = async (data) => {
    const id = data.label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    const row = await db.insertSeason({
      id,
      ...data,
      user_id: user.id,
      archived: false,
    })
    setSeasons((prev) => [...prev, row])
    return row
  }

  const updateSeason = async (id, data) => {
    const row = await db.updateSeason(id, data)
    setSeasons((prev) => prev.map((s) => (s.id === id ? row : s)))
    return row
  }

  const toggleArchiveSeason = async (id) => {
    const season = seasons.find((s) => s.id === id)
    if (!season) return
    const row = await db.updateSeason(id, { archived: !season.archived })
    setSeasons((prev) => prev.map((s) => (s.id === id ? row : s)))
  }

  const deleteSeason = async (id) => {
    await db.deleteSeason(id)
    setSeasons((prev) => prev.filter((s) => s.id !== id))
  }

  // Order management
  const addOrder = async (data) => {
    const row = await db.insertOrder({
      ...data,
      user_id: user.id,
    })
    setOrders((prev) => [row, ...prev])
    return row
  }

  const bulkAddOrders = async (rows) => {
    const inserted = await db.bulkInsertOrders(rows.map((r) => ({ ...r, user_id: user.id })))
    setOrders((prev) => [...inserted, ...prev])
    return inserted
  }

  const updateOrder = async (id, data) => {
    const row = await db.updateOrder(id, data)
    setOrders((prev) => prev.map((o) => (o.id === id ? row : o)))
    return row
  }

  const deleteOrder = async (id) => {
    await db.deleteOrder(id)
    setOrders((prev) => prev.filter((o) => o.id !== id))
    setCommissions((prev) => prev.filter((c) => c.order_id !== id))
  }

  // Commission management
  const upsertCommission = async (data) => {
    const row = await db.upsertCommission({
      ...data,
      user_id: user.id,
    })
    setCommissions((prev) => {
      const existing = prev.findIndex((c) => c.order_id === row.order_id)
      if (existing >= 0) {
        return prev.map((c, i) => (i === existing ? row : c))
      }
      return [row, ...prev]
    })
    return row
  }

  const updateCommission = async (id, data) => {
    const row = await db.updateCommission(id, data)
    setCommissions((prev) => prev.map((c) => (c.id === id ? row : c)))
    return row
  }

  const activeSeasons = seasons.filter((s) => !s.archived)
  const archivedSeasons = seasons.filter((s) => s.archived)

  const getSeasonsForCompany = (companyId) => {
    const companySeasons = seasons.filter((s) => s.company_id === companyId)
    return {
      active: companySeasons.filter((s) => !s.archived),
      archived: companySeasons.filter((s) => s.archived),
    }
  }

  // Returns sorted list of unique sale_cycle values from all seasons (including archived)
  const getActiveCycles = () => {
    const cycles = new Set()
    seasons.forEach((s) => {
      const c = deriveCycle(s)
      if (c) cycles.add(c)
    })
    return [...cycles].sort((a, b) => cycleSortKey(a) - cycleSortKey(b))
  }

  return (
    <SalesContext.Provider value={{
      seasons, activeSeasons, archivedSeasons, orders, commissions, loading,
      addSeason, updateSeason, toggleArchiveSeason, deleteSeason,
      addOrder, bulkAddOrders, updateOrder, deleteOrder,
      upsertCommission, updateCommission,
      getSeasonsForCompany, getActiveCycles, deriveCycle,
    }}>
      {children}
    </SalesContext.Provider>
  )
}

export function useSales() {
  return useContext(SalesContext)
}

export { deriveCycle, cycleSortKey }
