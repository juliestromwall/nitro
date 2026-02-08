import { createContext, useContext, useState } from 'react'
import { orders as initialOrders, seasons as initialSeasons } from '@/data/mockData'

const SalesContext = createContext()

export function SalesProvider({ children }) {
  const [seasons, setSeasons] = useState(
    initialSeasons.map((s) => ({ ...s, startDate: '', endDate: '', archived: false }))
  )
  const [orders, setOrders] = useState(initialOrders)

  // Season / tab management
  const addSeason = (data) => {
    const id = data.label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    const newSeason = { id, archived: false, ...data }
    setSeasons((prev) => [...prev, newSeason])
    return newSeason
  }

  const updateSeason = (id, data) => {
    setSeasons((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)))
  }

  const toggleArchiveSeason = (id) => {
    setSeasons((prev) => prev.map((s) => (s.id === id ? { ...s, archived: !s.archived } : s)))
  }

  // Order management
  const updateOrder = (id, data) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...data } : o)))
  }

  const deleteOrder = (id) => {
    setOrders((prev) => prev.filter((o) => o.id !== id))
  }

  const activeSeasons = seasons.filter((s) => !s.archived)
  const archivedSeasons = seasons.filter((s) => s.archived)

  return (
    <SalesContext.Provider value={{
      seasons, activeSeasons, archivedSeasons, orders,
      addSeason, updateSeason, toggleArchiveSeason,
      updateOrder, deleteOrder,
    }}>
      {children}
    </SalesContext.Provider>
  )
}

export function useSales() {
  return useContext(SalesContext)
}
