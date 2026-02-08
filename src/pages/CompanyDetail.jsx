import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
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
  const { companies } = useCompanies()
  const company = companies.find((c) => c.id === parseInt(id))
  const [activeTab, setActiveTab] = useState('dashboard')
  const [addSaleOpen, setAddSaleOpen] = useState(false)

  if (!company) {
    return (
      <div className="px-6 py-8">
        <p>Company not found.</p>
        <Link to="/companies" className="text-blue-600 underline">Back to Companies</Link>
      </div>
    )
  }

  const handleAddSaleClick = () => {
    setActiveTab('sales')
    setAddSaleOpen(true)
  }

  return (
    <div className="px-4 py-8 space-y-6 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/companies" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          {company.logo ? (
            <img src={company.logo} alt="" className="w-8 h-8 object-contain" />
          ) : (
            <div className="w-8 h-8 rounded bg-zinc-200 flex items-center justify-center text-zinc-600 text-sm font-bold">
              {company.name.charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <Badge variant="outline">{company.commissionPercent}% Commission</Badge>
        </div>
        <Button onClick={handleAddSaleClick}>
          <Plus className="size-4 mr-1" /> Add Sale
        </Button>
      </div>

      {/* Tab bar — pill-style buttons */}
      <div className="flex items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
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
  )
}

export default CompanyDetail
