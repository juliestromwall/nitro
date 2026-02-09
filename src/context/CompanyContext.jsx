import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import * as db from '@/lib/db'

const CompanyContext = createContext()

export function CompanyProvider({ children }) {
  const { user } = useAuth()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const data = await db.fetchCompanies()
      setCompanies(data)
    } catch (err) {
      console.error('Failed to load companies:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const addCompany = async (data) => {
    const maxOrder = companies.reduce((max, c) => Math.max(max, c.sort_order ?? 0), 0)
    const row = await db.insertCompany({
      ...data,
      user_id: user.id,
      archived: false,
      sort_order: maxOrder + 1,
    })
    setCompanies((prev) => [...prev, row])
    return row
  }

  const updateCompany = async (id, data) => {
    const row = await db.updateCompany(id, data)
    setCompanies((prev) => prev.map((c) => (c.id === id ? row : c)))
    return row
  }

  const toggleArchive = async (id) => {
    const company = companies.find((c) => c.id === id)
    if (!company) return
    const row = await db.updateCompany(id, { archived: !company.archived })
    setCompanies((prev) => prev.map((c) => (c.id === id ? row : c)))
  }

  const reorderCompanies = async (fromIndex, toIndex) => {
    setCompanies((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })

    // Persist sort orders
    const reordered = [...companies]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    const updates = reordered.map((c, i) => ({ id: c.id, sort_order: i }))
    try {
      await db.updateCompanySortOrders(updates)
    } catch (err) {
      console.error('Failed to persist sort order:', err)
      load()
    }
  }

  const activeCompanies = companies.filter((c) => !c.archived)

  return (
    <CompanyContext.Provider value={{ companies, activeCompanies, loading, addCompany, updateCompany, toggleArchive, reorderCompanies }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompanies() {
  return useContext(CompanyContext)
}
