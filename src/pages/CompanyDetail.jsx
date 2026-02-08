import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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

  if (!company) {
    return (
      <div className="px-6 py-8">
        <p>Company not found.</p>
        <Link to="/companies" className="text-blue-600 underline">Back to Companies</Link>
      </div>
    )
  }

  return (
    <div className="px-4 py-8 space-y-6 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/companies" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-3">
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
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-zinc-900 text-zinc-900'
                : 'text-muted-foreground hover:text-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'dashboard' && <CompanyDashboard companyId={company.id} />}
      {activeTab === 'sales' && <CompanySales companyId={company.id} />}
      {activeTab === 'commission' && <CompanyCommission companyId={company.id} />}
    </div>
  )
}

export default CompanyDetail
