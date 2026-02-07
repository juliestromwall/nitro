import { createContext, useContext, useState } from 'react'
import { companies as initialCompanies } from '@/data/mockData'

const CompanyContext = createContext()

export function CompanyProvider({ children }) {
  const [companies, setCompanies] = useState(initialCompanies)

  const addCompany = (data) => {
    const newCompany = {
      id: Math.max(...companies.map((c) => c.id), 0) + 1,
      logo: null,
      archived: false,
      ...data,
    }
    setCompanies((prev) => [...prev, newCompany])
    return newCompany
  }

  const updateCompany = (id, data) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...data } : c))
    )
  }

  const toggleArchive = (id) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, archived: !c.archived } : c))
    )
  }

  const activeCompanies = companies.filter((c) => !c.archived)

  return (
    <CompanyContext.Provider value={{ companies, activeCompanies, addCompany, updateCompany, toggleArchive }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompanies() {
  return useContext(CompanyContext)
}
