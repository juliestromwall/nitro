import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import {
  fetchBrandConnections,
  fetchConnectedCompanies,
  fetchConnectedUserDetails,
} from '@/lib/brandAdminDb'

const BrandAdminContext = createContext()

export function BrandAdminProvider({ children }) {
  const { user, isBrandAdmin } = useAuth()
  const [connections, setConnections] = useState([])
  const [repUsers, setRepUsers] = useState({}) // { repId: { name, email, avatar_url } }
  const [repCompanies, setRepCompanies] = useState({}) // { repId: [companies] }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !isBrandAdmin) {
      setLoading(false)
      return
    }

    loadData()
  }, [user, isBrandAdmin])

  async function loadData() {
    try {
      setLoading(true)
      const conns = await fetchBrandConnections()
      setConnections(conns)

      if (conns.length === 0) {
        setLoading(false)
        return
      }

      // Get unique rep IDs
      const repIds = [...new Set(conns.map((c) => c.rep_id))]

      // Fetch rep user details and their companies in parallel
      const [users, ...companiesByRep] = await Promise.all([
        fetchConnectedUserDetails(repIds),
        ...repIds.map((repId) => fetchConnectedCompanies(repId)),
      ])

      setRepUsers(users)

      const companiesMap = {}
      repIds.forEach((repId, i) => {
        companiesMap[repId] = companiesByRep[i]
      })
      setRepCompanies(companiesMap)
    } catch (err) {
      console.error('Failed to load brand admin data:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <BrandAdminContext.Provider value={{ connections, repUsers, repCompanies, loading, refresh: loadData }}>
      {children}
    </BrandAdminContext.Provider>
  )
}

export function useBrandAdmin() {
  return useContext(BrandAdminContext)
}
