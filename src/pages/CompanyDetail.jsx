import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ArrowLeft, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCompanies } from '@/context/CompanyContext'
import CompanyDashboard from '@/components/company/CompanyDashboard'
import CompanySales from '@/components/company/CompanySales'
import CompanyCommission from '@/components/company/CompanyCommission'

const tabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Sales' },
  { id: 'commission', label: 'Commission' },
]

function CompanyDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { companies } = useCompanies()
  const company = companies.find((c) => c.id === parseInt(id))

  // Restore tab from homepage setting if this is the saved homepage
  const [activeTab, setActiveTab] = useState(() => {
    if (!user) return 'dashboard'
    try {
      const saved = JSON.parse(localStorage.getItem(`homepage-${user.id}`))
      if (saved?.path === `/companies/${id}` && saved?.tab) return saved.tab
    } catch { /* ignore */ }
    return 'dashboard'
  })
  const [addSaleOpen, setAddSaleOpen] = useState(false)

  // Persist active tab so App.jsx can read it when setting homepage
  useEffect(() => {
    localStorage.setItem(`activeTab-${id}`, activeTab)
  }, [id, activeTab])

  if (!company) {
    return (
      <div className="px-6 py-8">
        <p>Brand not found.</p>
        <Link to="/companies" className="text-blue-600 underline">Back to Brands</Link>
      </div>
    )
  }

  const handleAddSaleClick = () => {
    setActiveTab('sales')
    setAddSaleOpen(true)
  }

  return (
    <div style={{ minWidth: 'fit-content' }}>
      {/* Sticky Header + Tabs */}
      <div className="sticky top-0 z-30 bg-background px-4 pt-8 pb-0">
        <div className="flex items-center gap-3 pb-4">
          <Link to="/companies" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          {company.logo_path ? (
            <img src={company.logo_path} alt="" className="w-8 h-8 object-contain" />
          ) : (
            <div className="w-8 h-8 rounded bg-zinc-200 flex items-center justify-center text-zinc-600 text-sm font-bold">
              {company.name.charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <Badge variant="outline">{company.commission_percent}% Commission</Badge>
          <Button className="bg-[#005b5b] hover:bg-[#007a7a] text-white" onClick={handleAddSaleClick}>
            <Plus className="size-4 mr-1" /> Add Sale
          </Button>
        </div>

        {/* Tab bar — underline-style */}
        <div className="flex items-center gap-6 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-1 py-2 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-[#005b5b] border-b-2 border-[#005b5b]'
                  : 'text-muted-foreground hover:text-zinc-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 pb-8 pt-6 space-y-6">
      {activeTab === 'dashboard' && <CompanyDashboard companyId={company.id} />}
      {activeTab === 'sales' && (
        <CompanySales
          companyId={company.id}
          addSaleOpen={addSaleOpen}
          setAddSaleOpen={setAddSaleOpen}
        />
      )}
      {activeTab === 'commission' && <CompanyCommission companyId={company.id} />}
      </div>
    </div>
  )
}

export default CompanyDetail
