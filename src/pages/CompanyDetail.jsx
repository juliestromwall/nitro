import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ArrowLeft, Plus, Home, Upload, MoreVertical, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useCompanies } from '@/context/CompanyContext'
import { useSales } from '@/context/SalesContext'
import { fetchBrandUploads } from '@/lib/db'
import CompanyDashboard from '@/components/company/CompanyDashboard'
import CompanySales from '@/components/company/CompanySales'
import CompanyCommission from '@/components/company/CompanyCommission'
import CompanyPayments from '@/components/company/CompanyPayments'
import BulkPaymentModal from '@/components/company/BulkPaymentModal'
import ImportPaymentsModal from '@/components/company/ImportPaymentsModal'
import ImportSalesModal from '@/components/company/ImportSalesModal'
import InviteBrandAdminModal from '@/components/company/InviteBrandAdminModal'
import BrandAdminConnections from '@/components/company/BrandAdminConnections'
import CompanyBrandImports from '@/components/company/CompanyBrandImports'

const tabs = [
  { id: 'dashboard', label: 'Brand', icon: Home },
  { id: 'sales', label: 'Sales' },
  { id: 'commission', label: 'Commissions' },
  { id: 'payments', label: 'Payments' },
  // { id: 'imports', label: 'Brand Imports' },  // Hidden until ready for production
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
      if ((saved?.path === `/app/companies/${id}` || saved?.path === `/companies/${id}`) && saved?.tab) return saved.tab
    } catch { /* ignore */ }
    return 'dashboard'
  })
  const [addSaleOpen, setAddSaleOpen] = useState(false)
  const [addPaymentOpen, setAddPaymentOpen] = useState(false)
  const [importCsvOpen, setImportCsvOpen] = useState(false)
  const [importSalesOpen, setImportSalesOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [importsPendingCount, setImportsPendingCount] = useState(0)

  // Load pending imports count
  useEffect(() => {
    if (!company) return
    fetchBrandUploads(company.id)
      .then((uploads) => {
        setImportsPendingCount(uploads.filter((u) => u.status === 'pending' || u.status === 'unmatched').length)
      })
      .catch(() => {})
  }, [id])

  // Listen for tour-set-tab events to programmatically switch tabs
  useEffect(() => {
    const handler = (e) => {
      const tab = e.detail?.tab
      if (tab && tabs.some((t) => t.id === tab)) setActiveTab(tab)
    }
    window.addEventListener('tour-set-tab', handler)
    return () => window.removeEventListener('tour-set-tab', handler)
  }, [])

  // Shared tracker state between Sales and Commission tabs
  const { getSeasonsForCompany } = useSales()
  const companySeasons = getSeasonsForCompany(parseInt(id))
  const [activeTracker, setActiveTracker] = useState(() => {
    // Restore tracker from homepage setting if this is the saved homepage
    if (user) {
      try {
        const saved = JSON.parse(localStorage.getItem(`homepage-${user.id}`))
        if ((saved?.path === `/app/companies/${id}` || saved?.path === `/companies/${id}`) && saved?.tracker) {
          const validIds = [...companySeasons.active.map(s => s.id), 'all']
          if (validIds.includes(saved.tracker)) return saved.tracker
        }
      } catch { /* ignore */ }
    }
    return companySeasons.active[0]?.id || ''
  })

  // Reset activeTracker when company changes or when current tracker isn't valid for this company
  useEffect(() => {
    const { active } = companySeasons
    const validIds = [...active.map((s) => s.id), 'all']
    if (!activeTracker || !validIds.includes(activeTracker)) {
      setActiveTracker(active[0]?.id || '')
    }
  }, [id, companySeasons.active.length])

  // Persist active tab + tracker so AppLayout can read them when setting homepage
  useEffect(() => {
    localStorage.setItem(`activeTab-${id}`, activeTab)
  }, [id, activeTab])

  useEffect(() => {
    if (activeTracker) localStorage.setItem(`activeTracker-${id}`, activeTracker)
  }, [id, activeTracker])

  if (!company) {
    return (
      <div className="px-6 py-4">
        <p>Brand not found.</p>
        <Link to="/app/companies" className="text-blue-600 underline">Back to Brands</Link>
      </div>
    )
  }

  const handleAddSaleClick = () => {
    setActiveTab('sales')
    setAddSaleOpen(true)
  }

  const handleImportSalesClick = () => {
    setActiveTab('sales')
    setImportSalesOpen(true)
  }

  const handleAddPaymentClick = () => {
    setActiveTab('commission')
    setAddPaymentOpen(true)
  }

  const handleImportCsvClick = () => {
    setActiveTab('commission')
    setImportCsvOpen(true)
  }

  return (
    <div style={{ minWidth: 'fit-content' }}>
      {/* Sticky Header + Tabs */}
      <div className="sticky top-0 z-30 bg-background px-4 pt-4 pb-0">
        <div className="flex items-center gap-3 pb-4">
          <Link to="/app/companies" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              {company.logo_path ? (
                <img src={company.logo_path} alt="" className="w-8 h-8 object-contain" />
              ) : (
                <div className="w-8 h-8 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 text-sm font-bold">
                  {company.name.charAt(0)}
                </div>
              )}
              <h1 className="text-2xl font-bold">{company.name}</h1>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button data-tour="btn-add-sale" className="bg-[#005b5b] hover:bg-[#007a7a] text-white" onClick={handleAddSaleClick}>
              <Plus className="size-4 mr-1" /> Add Sale
            </Button>
            <Button data-tour="btn-add-payment" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleAddPaymentClick}>
              <Plus className="size-4 mr-1" /> Add Payment
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-tour="btn-more-menu" variant="outline" size="icon" className="h-9 w-9">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-tour="btn-import-sales" onClick={handleImportSalesClick}>
                  <Upload className="size-4 mr-2" /> Import Sales
                </DropdownMenuItem>
                <DropdownMenuItem data-tour="btn-import-payments" onClick={handleImportCsvClick}>
                  <Upload className="size-4 mr-2" /> Import Payments
                </DropdownMenuItem>
                {/* <DropdownMenuItem onClick={() => setInviteModalOpen(true)}>
                  <UserPlus className="size-4 mr-2" /> Invite Brand Admin
                </DropdownMenuItem> */}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tab bar — underline-style */}
        <div className="flex items-center gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-tour={tab.id !== 'dashboard' ? `tab-${tab.id}` : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 transition-colors relative flex items-center gap-1 ${
                activeTab === tab.id
                  ? 'text-[#005b5b] font-bold text-base'
                  : 'text-muted-foreground hover:text-foreground text-sm font-medium'
              }`}
            >
              {tab.icon && <tab.icon className="size-3.5" />}
              {tab.label}
              {tab.id === 'imports' && importsPendingCount > 0 && (
                <span className="ml-1 bg-[#005b5b] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {importsPendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 pb-8 pt-4 space-y-6">
      {activeTab === 'dashboard' && (
        <>
          <CompanyDashboard companyId={company.id} />
          {/* <BrandAdminConnections companyId={company.id} /> */}
        </>
      )}
      {activeTab === 'sales' && (
        <CompanySales
          companyId={company.id}
          addSaleOpen={addSaleOpen}
          setAddSaleOpen={setAddSaleOpen}
          activeTracker={activeTracker}
          setActiveTracker={setActiveTracker}
        />
      )}
      {activeTab === 'commission' && (
        <CompanyCommission
          companyId={company.id}
          activeTracker={activeTracker}
          setActiveTracker={setActiveTracker}
        />
      )}
      {activeTab === 'payments' && (
        <CompanyPayments
          companyId={company.id}
          activeTracker={activeTracker}
          setActiveTracker={setActiveTracker}
        />
      )}
      {activeTab === 'imports' && (
        <CompanyBrandImports companyId={company.id} />
      )}
      </div>

      <BulkPaymentModal
        open={addPaymentOpen}
        onOpenChange={setAddPaymentOpen}
        companyId={company.id}
      />

      <ImportPaymentsModal
        open={importCsvOpen}
        onOpenChange={setImportCsvOpen}
        companyId={company.id}
      />

      <ImportSalesModal
        open={importSalesOpen}
        onOpenChange={setImportSalesOpen}
        companyId={company.id}
      />

      <InviteBrandAdminModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        companyId={company.id}
      />
    </div>
  )
}

export default CompanyDetail
