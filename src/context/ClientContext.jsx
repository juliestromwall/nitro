import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import * as db from '@/lib/db'

const ClientContext = createContext()

export function ClientProvider({ children }) {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const data = await db.fetchClients()
      setClients(data)
    } catch (err) {
      console.error('Failed to load clients:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const addClient = async (data) => {
    const row = await db.insertClient({ ...data, user_id: user.id })
    setClients((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
    return row
  }

  const updateClient = async (id, data) => {
    const row = await db.updateClient(id, data)
    setClients((prev) => prev.map((c) => (c.id === id ? row : c)))
    return row
  }

  const removeClient = async (id) => {
    await db.deleteClient(id)
    setClients((prev) => prev.filter((c) => c.id !== id))
  }

  const getClientName = (clientId) => {
    const client = clients.find((c) => c.id === clientId)
    return client ? client.name : 'Unknown'
  }

  return (
    <ClientContext.Provider value={{ clients, loading, addClient, updateClient, removeClient, getClientName }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useClients() {
  return useContext(ClientContext)
}
