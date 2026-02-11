import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import * as db from '@/lib/db'

const SalesContext = createContext()

export function SalesProvider({ children }) {
  const { user } = useAuth()
  const [seasons, setSeasons] = useState([])
  const [orders, setOrders] = useState([])
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)

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

  // Season management
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
    // Also remove any associated commission
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

  return (
    <SalesContext.Provider value={{
      seasons, activeSeasons, archivedSeasons, orders, commissions, loading,
      addSeason, updateSeason, toggleArchiveSeason,
      addOrder, bulkAddOrders, updateOrder, deleteOrder,
      upsertCommission, updateCommission,
    }}>
      {children}
    </SalesContext.Provider>
  )
}

export function useSales() {
  return useContext(SalesContext)
}
