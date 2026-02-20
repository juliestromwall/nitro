import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import * as db from '@/lib/db'

const AccountContext = createContext()

const CACHE_KEY = 'rc_cache_accounts'

export function AccountProvider({ children }) {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || [] } catch { return [] }
  })
  const [loading, setLoading] = useState(() => {
    try { return !JSON.parse(localStorage.getItem(CACHE_KEY))?.length } catch { return true }
  })

  const load = useCallback(async () => {
    if (!user) return
    try {
      const data = await db.fetchAccounts()
      setAccounts(data)
      localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch (err) {
      console.error('Failed to load accounts:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const addAccount = async (data) => {
    const row = await db.insertAccount({ ...data, user_id: user.id })
    setAccounts((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
    return row
  }

  const addAccounts = async (rows) => {
    const inserted = await db.bulkInsertAccounts(rows.map((r) => ({ ...r, user_id: user.id })))
    setAccounts((prev) => [...prev, ...inserted].sort((a, b) => a.name.localeCompare(b.name)))
    return inserted
  }

  const updateAccount = async (id, data) => {
    const row = await db.updateAccount(id, data)
    setAccounts((prev) => prev.map((a) => (a.id === id ? row : a)))
    return row
  }

  const removeAccount = async (id) => {
    await db.deleteAccount(id)
    setAccounts((prev) => prev.filter((a) => a.id !== id))
  }

  const getAccountName = (accountId) => {
    const account = accounts.find((a) => a.id === accountId)
    return account ? account.name : 'Unknown'
  }

  const getAccount = (accountId) => {
    return accounts.find((a) => a.id === accountId) || null
  }

  return (
    <AccountContext.Provider value={{ accounts, loading, addAccount, addAccounts, updateAccount, removeAccount, getAccountName, getAccount }}>
      {children}
    </AccountContext.Provider>
  )
}

export function useAccounts() {
  return useContext(AccountContext)
}
