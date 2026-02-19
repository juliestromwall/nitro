import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { Plus, FolderArchive, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Search, Filter, FileText, Upload, AlertTriangle, StickyNote, PartyPopper, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useAuth } from '@/context/AuthContext'
import { uploadDocument, getDocumentUrl } from '@/lib/db'
import { useSales } from '@/context/SalesContext'
import { EXCLUDED_STAGES } from '@/lib/constants'
import ImportSalesModal from '@/components/company/ImportSalesModal'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getItems = (order) => {
  if (order.items && order.items.length > 0) return order.items.join(', ')
  return ''
}

const fmtDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return dateStr
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

// Normalize any date string to YYYY-MM-DD for HTML date inputs
const toISODate = (dateStr) => {
  if (!dateStr) return ''
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  // Try parsing MM/DD/YYYY or other formats
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SortIcon = ({ column, sortConfig }) => {
  if (sortConfig.key !== column) return <ArrowUpDown className="size-3 opacity-40" />
  return sortConfig.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
}

// Cents-first currency formatting: raw digits → "$X,XXX.XX"
// Typing "4424" stores "4424" (cents), displayed as "44.24"
const centsToDisplay = (raw) => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  const dollars = (cents / 100).toFixed(2)
  const [whole, dec] = dollars.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas}.${dec}`
}

// Convert stored cents-string back to a float for DB
const centsToFloat = (raw) => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  return parseInt(digits, 10) / 100
}

// Convert a dollar float (e.g. 48750.00) to cents-string for the input state
const floatToCents = (val) => {
  const num = parseFloat(val)
  if (isNaN(num)) return ''
  return String(Math.round(num * 100))
}

// Read invoices from new JSONB array, falling back to legacy invoice_number/invoice_document fields
const getInvoices = (order) => {
  if (order.invoices && order.invoices.length > 0) return order.invoices
  if (order.invoice_number) {
    const nums = order.invoice_number.split(',').map((s) => s.trim()).filter(Boolean)
    return nums.map((num, i) => ({
      number: num,
      amount: 0,
      document: i === 0 ? order.invoice_document || null : null,
    }))
  }
  return []
}

const HYPE_CATEGORIES = {
  snow: {
    openers: [
      "LET'S GOOO! That's",
      "STACKED! You just earned",
      "SENDING IT! That's",
      "FULL SEND! You just locked in",
      "BOOSTED! That's",
      "CRUSHED IT! You just banked",
      "SHREDDING! That's",
      "STOMPED IT! You just scored",
      "ON FIRE! That's",
      "DROPPING IN HOT! You just secured",
      "BUTTERED THAT DEAL! That's",
      "CLEAN LANDING! You just pocketed",
      "POWDER DAY VIBES! That's",
      "CORK 10 ENERGY! You just earned",
      "STRAIGHT CHARGING! That's",
    ],
    closers: [
      "in commission! Keep shredding!",
      "in commission! The mountain is yours!",
      "in commission! Nothing but freshies!",
      "in commission! You're on a heater!",
      "in commission! Keep stacking!",
      "in commission! Send it again!",
      "in commission! No flat days here!",
      "in commission! Waist deep in cash!",
    ],
  },
  skate: {
    openers: [
      "KICKFLIPPED THAT DEAL! That's",
      "NOLLIE HEEL ENERGY! You just locked in",
      "LANDED IT CLEAN! That's",
      "SWITCH STANCE SAVAGE! You just earned",
      "RAIL SLIDE TO THE BANK! That's",
      "PRIMO'D THE COMPETITION! You just scored",
      "TREFLIP VIBES! That's",
      "DROPPED IN AND DOMINATED! You just banked",
    ],
    closers: [
      "in commission! Skate and don't stop!",
      "in commission! Go hit the next spot!",
      "in commission! Landed bolts!",
      "in commission! That was f*cking sick!",
      "in commission! First try, baby!",
    ],
  },
  surf: {
    openers: [
      "BARRELED! You just pocketed",
      "CAUGHT THE WAVE! That's",
      "HANGING TEN! You just earned",
      "OFFSHORE AND PUMPING! That's",
      "TUBE CITY! You just locked in",
      "PADDLED OUT AND SCORED! That's",
      "RIDING THE SWELL! You just banked",
      "STOKED AF! That's",
    ],
    closers: [
      "in commission! Surf's always up!",
      "in commission! Endless summer vibes!",
      "in commission! Paddle back out!",
      "in commission! That wave was yours!",
      "in commission! Salty and stacked!",
    ],
  },
  cheesy: {
    openers: [
      "HOLY SH*T! You just earned",
      "DAMN RIGHT! That's",
      "CHA-CHING, BABY! You just scored",
      "MONEY PRINTER GOES BRRR! That's",
      "YOU ABSOLUTE LEGEND! You just banked",
      "BIG DEAL ENERGY! That's",
      "DEAL-ICIOUS! You just pocketed",
      "COMMISSION IMPOSSIBLE? NAH! That's",
      "SALE OF THE CENTURY! You just earned",
      "NO BIG DEAL... JK IT'S HUGE! That's",
      "GET THAT BREAD! You just locked in",
      "MAKING IT RAIN! That's",
      "SOLD LIKE HOTCAKES! You just scored",
      "ABSOLUTELY DISGUSTING (in a good way)! That's",
      "SHUT THE FRONT DOOR! You just earned",
      "WINNER WINNER! You just banked",
      "TOO EASY! That's",
      "SMOOTH OPERATOR! You just pocketed",
      "THAT'S WHAT I'M TALKING ABOUT! That's",
      "THE DEAL WHISPERER STRIKES AGAIN! That's",
      "CASUAL FLEX! You just earned",
      "NOT EVEN TRYING! ...JK YOU CRUSHED IT! That's",
      "THE CLOSER HAS ENTERED THE CHAT! That's",
      "BANG BANG! You just locked in",
      "YOU BEAUTIFUL GENIUS! That's",
    ],
    closers: [
      "in commission! You're kind of a big deal!",
      "in commission! Tell your mom, she'd be proud!",
      "in commission! Not bad for a Tuesday!",
      "in commission! Treat yourself, king!",
      "in commission! That's rent money right there!",
      "in commission! Dad joke level: FUNDED!",
      "in commission! Alexa, play 'All I Do Is Win'!",
      "in commission! Put that on the fridge!",
      "in commission! You just out-sold yourself!",
      "in commission! Somebody call HR... wait, you ARE HR!",
      "in commission! Your accountant just smiled!",
      "in commission! Wallet status: THICC!",
      "in commission! That's a lot of tacos!",
      "in commission! Mic drop!",
      "in commission! You should put that on a resume!",
      "in commission! Main character energy!",
      "in commission! Save some deals for the rest of us!",
      "in commission! Your bank account says thank you!",
      "in commission! That's called RANGE!",
      "in commission! Too legit to quit!",
      "in commission! Built different!",
      "in commission! Tell 'em you're booked and busy!",
      "in commission! CEO of closing!",
    ],
  },
}

// Pick a random category-matched opener + closer. Cheesy = 60% weight.
function getRandomHype() {
  const roll = Math.random()
  const category = roll < 0.60 ? 'cheesy' : ['snow', 'skate', 'surf'][Math.floor(Math.random() * 3)]
  const cat = HYPE_CATEGORIES[category]
  return {
    hypeMessage: cat.openers[Math.floor(Math.random() * cat.openers.length)],
    hypeCloser: cat.closers[Math.floor(Math.random() * cat.closers.length)],
  }
}

// Generate sale cycle options from 2021 to 2050
const SALE_CYCLE_OPTIONS = (() => {
  const options = []
  for (let y = 2025; y <= 2050; y++) {
    options.push(`${y} Winter`, `${y} Spring`, `${y} Summer`, `${y} Fall`, `${y}-${y + 1}`)
  }
  return options
})()

function CompanySales({ companyId, addSaleOpen, setAddSaleOpen, activeTracker, setActiveTracker }) {
  const { accounts, getAccountName } = useAccounts()
  const { companies } = useCompanies()
  const { user } = useAuth()

  const {
    orders, commissions,
    addSeason, updateSeason, toggleArchiveSeason, deleteSeason,
    addOrder, bulkAddOrders, updateOrder, deleteOrder,
    getSeasonsForCompany,
  } = useSales()

  const { active: activeSeasons, archived: archivedSeasons } = getSeasonsForCompany(companyId)

  const getCompany = (id) => companies.find((c) => c.id === id)

  const getCommission = (order) => {
    const company = getCompany(order.company_id)
    const defaultPct = company?.commission_percent || 0
    const categoryPct = company?.category_commissions?.[order.order_type]
    const expectedPct = categoryPct != null ? categoryPct : defaultPct
    const pct = order.commission_override != null ? order.commission_override : expectedPct
    const isOverridden = order.commission_override != null && order.commission_override !== expectedPct
    return { amount: order.total * pct / 100, pct, isOverridden, defaultPct: expectedPct }
  }

  const company = getCompany(companyId)
  const commissionPct = company?.commission_percent || 0
  const companyOrderTypes = company?.order_types || []
  const companyItems = company?.items || []
  const DEFAULT_STAGES = ['Order Placed', 'Partially Shipped', 'Short Shipped', 'Cancelled']
  const customStages = (company?.stages || []).filter((s) => !DEFAULT_STAGES.includes(s))
  const companyStages = [...DEFAULT_STAGES, ...customStages]

  const activeTab = activeTracker
  const setActiveTab = setActiveTracker
  const [tabDialogOpen, setTabDialogOpen] = useState(false)
  const [editingTabId, setEditingTabId] = useState(null)
  const [tabForm, setTabForm] = useState({ label: '', sale_cycle: '' })
  const [deleteTrackerTarget, setDeleteTrackerTarget] = useState(null)
  const [deleteTrackerConfirm, setDeleteTrackerConfirm] = useState('')
  const [deletingTracker, setDeletingTracker] = useState(false)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  // Collapsed groups — expanded by default, track which are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const toggleGroup = (clientId) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOrderType, setFilterOrderType] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [showOrderTypeFilter, setShowOrderTypeFilter] = useState(false)
  const [showStageFilter, setShowStageFilter] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' })

  // Add/Edit Sale dialog state
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [saleRows, setSaleRows] = useState([{
    client_id: null, clientName: '', accountSearch: '', showAccountDropdown: false,
    sale_type: 'Pre-Book', season_id: '', order_type: '',
    total: '', commission_override: String(company?.commission_percent || ''),
    close_date: new Date().toISOString().slice(0, 10), showDetails: false,
    items: [], order_number: '', order_document: null, stage: 'Order Placed', notes: '',
  }])
  const orderDocRefs = useRef({})

  // Short Shipped confirmation dialog state
  const [shortShipConfirmOpen, setShortShipConfirmOpen] = useState(false)
  const [previousStage, setPreviousStage] = useState('')

  // Notes modal state
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [noteOrderId, setNoteOrderId] = useState(null)
  const [noteText, setNoteText] = useState('')

  // Import Sales modal state
  const [importSalesOpen, setImportSalesOpen] = useState(false)

  // Group invoice modal state
  const [groupInvoiceOpen, setGroupInvoiceOpen] = useState(false)
  const [groupInvoiceClientId, setGroupInvoiceClientId] = useState(null)
  const [groupInvoiceList, setGroupInvoiceList] = useState([])
  const groupInvoiceDocRefs = useRef({})

  // Celebration popup state
  const [celebrationOpen, setCelebrationOpen] = useState(false)
  const [celebrationData, setCelebrationData] = useState({ commission: 0, hypeMessage: '', hypeCloser: '' })

  const isAllView = activeTab === 'all'
  const showAllTab = activeSeasons.length >= 2

  // Helper to get tracker label from season_id
  const getTrackerLabel = (seasonId) => activeSeasons.find(s => s.id === seasonId)?.label || archivedSeasons.find(s => s.id === seasonId)?.label || '—'

  // Ensure activeTab is valid
  const allVisibleSeasons = showArchived
    ? [...activeSeasons, ...archivedSeasons]
    : activeSeasons
  const currentSeason = isAllView ? null : (allVisibleSeasons.find((s) => s.id === activeTab) || activeSeasons[0])

  const makeEmptyRow = () => ({
    client_id: null, clientName: '', accountSearch: '', showAccountDropdown: false,
    sale_type: 'Pre-Book', season_id: currentSeason?.id || '',
    order_type: '', total: '',
    commission_override: String(company?.commission_percent || ''),
    close_date: new Date().toISOString().slice(0, 10), showDetails: false,
    items: [], order_number: '', order_document: null, stage: 'Order Placed', notes: '',
  })

  // Row management helpers
  const addSaleRow = () => setSaleRows((prev) => [...prev, makeEmptyRow()])
  const updateSaleRow = (index, field, value) => {
    setSaleRows((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }
  const removeSaleRow = (index) => setSaleRows((prev) => prev.filter((_, i) => i !== index))

  // Whether the sale dialog is in "edit" vs "add" mode
  const isEditMode = editingOrderId !== null
  const saleDialogOpen = addSaleOpen || isEditMode

  const closeSaleDialog = () => {
    setAddSaleOpen(false)
    setEditingOrderId(null)
    setSaleRows([makeEmptyRow()])
  }

  const getExpectedRate = (orderType) => {
    const categoryPct = company?.category_commissions?.[orderType]
    return categoryPct != null ? categoryPct : (company?.commission_percent || 0)
  }

  const resetSaleForm = () => {
    setSaleRows([makeEmptyRow()])
  }

  // Tab dialog handlers
  const openCreateTab = () => {
    setEditingTabId(null)
    setTabForm({ label: '', sale_cycle: '' })
    setTabDialogOpen(true)
  }

  const openEditTab = (season) => {
    setEditingTabId(season.id)
    setTabForm({ label: season.label, sale_cycle: season.sale_cycle || '' })
    setTabDialogOpen(true)
  }

  const [tabSaving, setTabSaving] = useState(false)

  const handleTabSubmit = async () => {
    const label = tabForm.label.trim()
    if (!label) return
    const id = editingTabId
    const saleCycle = tabForm.sale_cycle || null

    // Auto-derive year from sale_cycle for backward compat
    let year = null
    if (saleCycle) {
      const yearMatch = saleCycle.match(/^(\d{4})/)
      if (yearMatch) year = yearMatch[1]
    }

    setTabSaving(true)
    try {
      if (id) {
        await updateSeason(id, { label, sale_cycle: saleCycle, ...(year ? { year } : {}) })
      } else {
        const s = await addSeason({ label, company_id: companyId, sale_cycle: saleCycle, ...(year ? { year } : {}) })
        setActiveTab(s.id)
      }
      setTabDialogOpen(false)
      setTabForm({ label: '', sale_cycle: '' })
      setEditingTabId(null)
    } catch (err) {
      console.error('Failed to save tracker:', err)
      alert('Failed to save tracker: ' + (err.message || 'Unknown error. Check your connection.'))
    } finally {
      setTabSaving(false)
    }
  }

  const handleArchiveFromModal = async () => {
    const id = editingTabId
    // Close dialog immediately, then run API
    setTabDialogOpen(false)
    setEditingTabId(null)
    setTabForm({ label: '', sale_cycle: '' })
    if (activeTab === id) {
      const remaining = activeSeasons.filter((s) => s.id !== id)
      setActiveTab(remaining[0]?.id || '')
    }
    try {
      await toggleArchiveSeason(id)
    } catch (err) {
      console.error('Failed to archive tracker:', err)
    }
  }

  // Open edit modal for an existing order
  const openEditOrder = (order) => {
    setEditingOrderId(order.id)
    setSaleRows([{
      client_id: order.client_id,
      clientName: getAccountName(order.client_id),
      accountSearch: '',
      showAccountDropdown: false,
      sale_type: order.sale_type || 'Pre-Book',
      season_id: order.season_id || currentSeason?.id || '',
      order_type: order.order_type,
      total: floatToCents(order.total),
      commission_override: order.commission_override != null ? String(order.commission_override) : String(getExpectedRate(order.order_type)),
      close_date: toISODate(order.close_date),
      showDetails: true,
      items: order.items || [],
      order_number: order.order_number,
      order_document: order.order_document || null,
      stage: order.stage,
      notes: order.notes || '',
    }])
  }

  // Toggle item in checkbox list for a specific row
  const toggleItem = (rowIndex, item) => {
    setSaleRows((prev) => {
      const updated = [...prev]
      const row = updated[rowIndex]
      updated[rowIndex] = {
        ...row,
        items: row.items.includes(item)
          ? row.items.filter((i) => i !== item)
          : [...row.items, item],
      }
      return updated
    })
  }

  // Add or Edit Sale submit
  const handleSaleSubmit = async () => {
    if (isEditMode) {
      // Single-row edit
      const row = saleRows[0]
      if (!row.client_id || !centsToFloat(row.total)) return

      const total = centsToFloat(row.total)
      const commOverride = row.commission_override.trim() !== '' ? parseFloat(row.commission_override) : null

      try {
        await updateOrder(editingOrderId, {
          client_id: row.client_id,
          company_id: companyId,
          season_id: row.season_id || currentSeason?.id,
          sale_type: row.sale_type,
          order_type: row.order_type,
          items: row.items,
          order_number: row.order_number,
          close_date: row.close_date,
          stage: row.stage,
          order_document: row.order_document,
          total,
          commission_override: commOverride,
          notes: row.notes,
        })
      } catch (err) {
        console.error('Failed to save order:', err)
        if (err.message?.includes('timed out') || err.message?.includes('signal is aborted')) {
          alert('Your session has expired. Please sign in again.')
          window.location.href = '/login'
        } else {
          alert('Failed to save. Please try again.')
        }
        return
      }

      closeSaleDialog()
      return
    }

    // Multi-row add
    const validRows = saleRows.filter((r) => r.client_id && centsToFloat(r.total) > 0)
    if (validRows.length === 0) return

    let totalCommission = 0

    for (const row of validRows) {
      const total = centsToFloat(row.total)
      const commOverride = row.commission_override.trim() !== '' ? parseFloat(row.commission_override) : null

      const orderData = {
        client_id: row.client_id,
        company_id: companyId,
        season_id: row.season_id || currentSeason?.id,
        sale_type: row.sale_type,
        order_type: row.order_type || companyOrderTypes[0] || '',
        items: row.items,
        order_number: row.order_number,
        close_date: row.close_date,
        stage: row.stage || 'Order Placed',
        order_document: row.order_document,
        total,
        commission_override: commOverride,
        notes: row.notes,
      }

      try {
        await addOrder(orderData)
      } catch (err) {
        console.error('Failed to add order:', err)
        if (err.message?.includes('timed out') || err.message?.includes('signal is aborted')) {
          alert('Your session has expired. Please sign in again.')
          window.location.href = '/login'
        } else {
          alert('Failed to add a sale. Please try again.')
        }
        return
      }

      const expectedPct = getExpectedRate(orderData.order_type)
      const pct = commOverride != null ? commOverride : expectedPct
      totalCommission += total * pct / 100
    }

    closeSaleDialog()

    // Show celebration popup
    if (totalCommission > 0) {
      const hype = getRandomHype()
      setCelebrationData({
        commission: totalCommission,
        ...hype,
      })
      setCelebrationOpen(true)
    }
  }

  const handleOrderDocUpload = async (e, rowIndex) => {
    const file = e.target.files?.[0]
    if (file && user) {
      try {
        const doc = await uploadDocument(user.id, editingOrderId || 'new', 'order', file)
        updateSaleRow(rowIndex, 'order_document', { name: doc.name, path: doc.path })
      } catch (err) {
        console.error('Failed to upload order document:', err)
      }
    }
    const ref = orderDocRefs.current[rowIndex]
    if (ref) ref.value = ''
  }

  // Stage change handler with Short Shipped confirmation
  const [shortShipRowIndex, setShortShipRowIndex] = useState(null)
  const handleStageChange = (rowIndex, newStage) => {
    if (newStage === 'Short Shipped') {
      setPreviousStage(saleRows[rowIndex].stage)
      setShortShipRowIndex(rowIndex)
      updateSaleRow(rowIndex, 'stage', newStage)
      setShortShipConfirmOpen(true)
    } else {
      updateSaleRow(rowIndex, 'stage', newStage)
    }
  }

  // Notes modal
  const openNoteModal = (order) => {
    setNoteOrderId(order.id)
    setNoteText(order.notes || '')
    setNoteModalOpen(true)
  }

  const saveNote = async () => {
    if (noteOrderId) {
      await updateOrder(noteOrderId, { notes: noteText })
    }
    setNoteModalOpen(false)
    setNoteOrderId(null)
    setNoteText('')
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const handleDelete = async () => {
    if (!confirmDeleteId) return
    await deleteOrder(confirmDeleteId)
    setConfirmDeleteId(null)
  }


  // Current season data filtered by companyId
  const seasonOrders = isAllView
    ? orders.filter((o) => o.company_id === companyId && activeSeasons.some(s => s.id === o.season_id))
    : currentSeason
      ? orders.filter((o) => o.season_id === currentSeason.id && o.company_id === companyId)
      : []

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  const filteredOrders = useMemo(() => {
    let result = seasonOrders

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((o) => {
        const accountName = getAccountName(o.client_id).toLowerCase()
        const orderNum = (o.order_number || '').toLowerCase()
        const invoiceNums = getInvoices(o).map((inv) => (inv.number || '').toLowerCase()).join(' ')
        const total = String(o.total)
        return accountName.includes(q) || orderNum.includes(q) || invoiceNums.includes(q) || total.includes(q)
      })
    }

    if (filterOrderType) {
      result = result.filter((o) => o.order_type === filterOrderType)
    }

    if (filterStage) {
      result = result.filter((o) => o.stage === filterStage)
    }

    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let av, bv
        switch (sortConfig.key) {
          case 'account': av = getAccountName(a.client_id); bv = getAccountName(b.client_id); break
          case 'sale_type': av = a.sale_type || ''; bv = b.sale_type || ''; break
          case 'order_type': av = a.order_type || ''; bv = b.order_type || ''; break
          case 'items': av = getItems(a); bv = getItems(b); break
          case 'order_number': av = a.order_number || ''; bv = b.order_number || ''; break
          case 'close_date': av = a.close_date || ''; bv = b.close_date || ''; break
          case 'stage': av = a.stage || ''; bv = b.stage || ''; break
          case 'total': return sortConfig.dir === 'asc' ? a.total - b.total : b.total - a.total
          case 'commission': return sortConfig.dir === 'asc' ? getCommission(a).amount - getCommission(b).amount : getCommission(b).amount - getCommission(a).amount
          default: return 0
        }
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortConfig.dir === 'asc' ? cmp : -cmp
      })
    }

    return result
  }, [seasonOrders, searchQuery, filterOrderType, filterStage, sortConfig])

  // Group filtered orders by account
  const groupedOrders = useMemo(() => {
    const groupMap = new Map()
    filteredOrders.forEach((order) => {
      const key = order.client_id
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          clientId: key,
          accountName: getAccountName(key),
          orders: [],
        })
      }
      groupMap.get(key).orders.push(order)
    })

    // Calculate totals for each group
    let groups = Array.from(groupMap.values()).map((group) => {
      const total = group.orders.reduce((sum, o) => sum + o.total, 0)
      const commissionTotal = group.orders.reduce((sum, o) => {
        if (EXCLUDED_STAGES.includes(o.stage)) return sum
        return sum + getCommission(o).amount
      }, 0)
      const allInvoices = group.orders.flatMap((o) => getInvoices(o))
      const invoicedTotal = allInvoices.reduce((sum, inv) => {
        const amt = typeof inv.amount === 'number' ? inv.amount : (inv.amount ? parseInt(String(inv.amount).replace(/\D/g, ''), 10) / 100 : 0)
        return sum + amt
      }, 0)

      // Check if commission is marked as short shipped for this account
      const groupComm = commissions.find(c => group.orders.some(o => o.id === c.order_id) && c.pay_status === 'short shipped')
      const isShortShipped = !!groupComm
      let unshippedSales = 0
      let adjustedSale = total
      let adjustedCommission = commissionTotal
      if (isShortShipped) {
        const firstOrderComm = commissions.find(c => c.order_id === group.orders[0]?.id)
        const totalPaid = firstOrderComm?.amount_paid || 0
        if (totalPaid < commissionTotal) {
          const commissionGap = commissionTotal - totalPaid
          // Use weighted average commission rate to back-calculate unshipped sales
          const avgPct = total > 0 ? (commissionTotal / total) * 100 : 0
          unshippedSales = avgPct > 0 ? commissionGap / (avgPct / 100) : 0
          adjustedSale = total - unshippedSales
          adjustedCommission = totalPaid
        }
      }

      // Check if overpaid — paid more than commission due
      const groupComms = commissions.filter(c => group.orders.some(o => o.id === c.order_id))
      const totalPaid = groupComms.reduce((sum, c) => sum + (c.amount_paid || 0), 0)
      const isOverpaid = totalPaid > commissionTotal && commissionTotal > 0 && !isShortShipped
      let overpaidAdjustedSale = total
      let overpaidAdjustedCommission = commissionTotal
      if (isOverpaid) {
        const avgPct = total > 0 ? (commissionTotal / total) * 100 : 0
        overpaidAdjustedSale = avgPct > 0 ? totalPaid / (avgPct / 100) : total
        overpaidAdjustedCommission = totalPaid
      }

      return {
        ...group,
        total,
        commissionTotal,
        allInvoices,
        invoicedTotal,
        pending: total - invoicedTotal,
        isShortShipped,
        unshippedSales,
        adjustedSale,
        adjustedCommission,
        isOverpaid,
        overpaidAdjustedSale,
        overpaidAdjustedCommission,
      }
    })

    // Sort groups based on sortConfig
    if (sortConfig.key) {
      groups.sort((a, b) => {
        switch (sortConfig.key) {
          case 'total':
            return sortConfig.dir === 'asc' ? a.total - b.total : b.total - a.total
          case 'commission':
            return sortConfig.dir === 'asc' ? a.commissionTotal - b.commissionTotal : b.commissionTotal - a.commissionTotal
          default: {
            let av, bv
            const aOrder = a.orders[0] || {}
            const bOrder = b.orders[0] || {}
            switch (sortConfig.key) {
              case 'stage': av = aOrder.stage || ''; bv = bOrder.stage || ''; break
              default: av = a.accountName; bv = b.accountName; break
            }
            const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
            return sortConfig.dir === 'asc' ? cmp : -cmp
          }
        }
      })
    } else {
      groups.sort((a, b) => a.accountName.localeCompare(b.accountName, undefined, { numeric: true }))
    }

    return groups
  }, [filteredOrders, sortConfig, commissions])

  // Group invoice modal handlers
  const openGroupInvoiceModal = (group) => {
    setGroupInvoiceClientId(group.clientId)
    // Collect all invoices from all orders in the group
    const allInvoices = group.orders.flatMap((o) => getInvoices(o))
    const mapped = allInvoices.map((inv) => ({
      number: inv.number || '',
      amount: typeof inv.amount === 'number' && inv.amount > 0 ? floatToCents(inv.amount) : inv.amount || '',
      document: inv.document || null,
    }))
    // Always start with at least one blank row
    if (mapped.length === 0) mapped.push({ number: '', amount: '', document: null })
    setGroupInvoiceList(mapped)
    setGroupInvoiceOpen(true)
  }

  const addGroupInvoice = () => {
    setGroupInvoiceList((prev) => [...prev, { number: '', amount: '', document: null }])
  }

  const updateGroupInvoice = (index, field, value) => {
    setGroupInvoiceList((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const removeGroupInvoice = (index) => {
    setGroupInvoiceList((prev) => prev.filter((_, i) => i !== index))
  }

  const handleGroupInvoiceDocUpload = async (e, invoiceIndex) => {
    const file = e.target.files?.[0]
    if (file && user) {
      try {
        const doc = await uploadDocument(user.id, 'group', `invoice-${invoiceIndex}`, file)
        setGroupInvoiceList((prev) => {
          const updated = [...prev]
          updated[invoiceIndex] = { ...updated[invoiceIndex], document: { name: doc.name, path: doc.path } }
          return updated
        })
      } catch (err) {
        console.error('Failed to upload invoice document:', err)
      }
    }
    const ref = groupInvoiceDocRefs.current[invoiceIndex]
    if (ref) ref.value = ''
  }

  const saveGroupInvoices = async () => {
    if (!groupInvoiceClientId) return

    // Convert amounts from cents-string to float for storage
    const cleanInvoices = groupInvoiceList.map((inv) => ({
      number: inv.number || '',
      amount: inv.amount ? (typeof inv.amount === 'number' ? inv.amount : parseInt(String(inv.amount).replace(/\D/g, ''), 10) / 100) : 0,
      document: inv.document || null,
    }))

    // Find all orders in this group (from current season)
    const groupOrders = seasonOrders.filter((o) => o.client_id === groupInvoiceClientId)
    if (groupOrders.length === 0) return

    // Save all invoices on the first order, clear from others
    const firstOrder = groupOrders[0]
    try {
      await updateOrder(firstOrder.id, {
        invoices: cleanInvoices,
        invoice_number: cleanInvoices.map((inv) => inv.number).filter(Boolean).join(', '),
        invoice_document: cleanInvoices[0]?.document || null,
      })

      // Clear invoices from other orders in the group
      for (let i = 1; i < groupOrders.length; i++) {
        await updateOrder(groupOrders[i].id, {
          invoices: [],
          invoice_number: '',
          invoice_document: null,
        })
      }
    } catch (err) {
      console.error('Failed to save group invoices:', err)
      if (err.message?.includes('invoices')) {
        // Fallback: just save invoice_number
        await updateOrder(firstOrder.id, {
          invoice_number: cleanInvoices.map((inv) => inv.number).filter(Boolean).join(', '),
          invoice_document: cleanInvoices[0]?.document || null,
        })
        for (let i = 1; i < groupOrders.length; i++) {
          await updateOrder(groupOrders[i].id, { invoice_number: '', invoice_document: null })
        }
      }
    }

    setGroupInvoiceOpen(false)
    setGroupInvoiceClientId(null)
    setGroupInvoiceList([])
  }

  const uniqueOrderTypes = [...new Set(seasonOrders.map((o) => o.order_type))]
  const uniqueStages = [...new Set(seasonOrders.map((o) => o.stage))]

  // Exclude cancelled and short shipped orders from totals
  const activeOrders = seasonOrders.filter((o) => !EXCLUDED_STAGES.includes(o.stage))
  const totalSales = activeOrders.reduce((sum, o) => sum + o.total, 0)
  const totalCommission = activeOrders.reduce((sum, o) => sum + getCommission(o).amount, 0)

  // Per-order-type totals for summary cards (excluding cancelled)
  const orderTypeTotals = useMemo(() => {
    const map = {}
    activeOrders.forEach((o) => {
      if (!map[o.order_type]) map[o.order_type] = 0
      map[o.order_type] += o.total
    })
    return map
  }, [activeOrders])

  return (
    <div className="space-y-6 min-w-0">
      {/* Season tabs bar */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-4 overflow-x-auto min-w-0">
          {showAllTab && (
            <button
              onClick={() => setActiveTab('all')}
              className={`py-1.5 whitespace-nowrap transition-colors ${
                isAllView
                  ? 'text-[#005b5b] font-bold text-base'
                  : 'text-muted-foreground hover:text-zinc-700 dark:hover:text-zinc-300 text-sm font-medium'
              }`}
            >
              All Sales
            </button>
          )}
          {activeSeasons.map((season) => (
            <div key={season.id} className="group flex items-center">
              <button
                onClick={() => setActiveTab(season.id)}
                className={`py-1.5 whitespace-nowrap transition-colors ${
                  activeTab === season.id
                    ? 'text-[#005b5b] font-bold text-base'
                    : 'text-muted-foreground hover:text-zinc-700 dark:hover:text-zinc-300 text-sm font-medium'
                }`}
              >
                {season.label}
              </button>
              <button
                onClick={() => openEditTab(season)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-zinc-700 dark:hover:text-zinc-300 ml-1"
                title="Edit tab"
              >
                <Pencil className="size-3" />
              </button>
            </div>
          ))}
          <button
            data-tour="new-tracker"
            onClick={openCreateTab}
            className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-zinc-300 dark:border-zinc-600 rounded-md whitespace-nowrap flex items-center gap-1 shrink-0 transition-colors"
          >
            <Plus className="size-3.5" /> New Sales Tracker
          </button>
        </div>

        {archivedSeasons.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1 whitespace-nowrap"
            >
              <FolderArchive className="size-3.5" />
              Archived ({archivedSeasons.length})
              <ChevronDown className={`size-3 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
            </button>
            {showArchived && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-800 border dark:border-zinc-700 rounded-lg shadow-lg z-10 min-w-48">
                {archivedSeasons.map((season) => (
                  <button
                    key={season.id}
                    onClick={() => { openEditTab(season); setShowArchived(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    <span className="flex-1 text-left">{season.label}</span>
                    <Pencil className="size-3.5 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit tab dialog */}
      <Dialog open={tabDialogOpen} onOpenChange={(open) => {
        setTabDialogOpen(open)
        if (!open) { setEditingTabId(null); setTabForm({ label: '', sale_cycle: '' }) }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTabId ? 'Edit Sales Tracker' : 'New Sales Tracker'}</DialogTitle>
            <DialogDescription>
              {editingTabId ? 'Update this tracker or change its archive status.' : 'Create a new tracker for a specific sales period.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sale Cycle</Label>
              <select
                value={tabForm.sale_cycle}
                onChange={(e) => setTabForm((p) => ({ ...p, sale_cycle: e.target.value }))}
                className="w-full border rounded-md px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="">Select a cycle...</option>
                {SALE_CYCLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tabLabel">Tracker Name</Label>
              <Input
                id="tabLabel"
                placeholder=""
                value={tabForm.label}
                onChange={(e) => setTabForm((p) => ({ ...p, label: e.target.value }))}
              />
            </div>
            <DialogFooter className="flex gap-2">
              {editingTabId && (() => {
                const isArchived = archivedSeasons.some((s) => s.id === editingTabId)
                return (
                  <>
                    <Button
                      variant={isArchived ? 'default' : 'destructive'}
                      className={isArchived ? 'bg-[#005b5b] hover:bg-[#007a7a] mr-auto' : 'mr-auto'}
                      onClick={handleArchiveFromModal}
                    >
                      <FolderArchive className="size-4 mr-1" />
                      {isArchived ? 'Unarchive' : 'Archive'}
                    </Button>
                    {(() => {
                      const hasOrders = orders.some((o) => o.season_id === editingTabId)
                      return (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={hasOrders}
                          onClick={() => {
                            const season = [...activeSeasons, ...archivedSeasons].find((s) => s.id === editingTabId)
                            setDeleteTrackerTarget(season)
                            setDeleteTrackerConfirm('')
                            setTabDialogOpen(false)
                          }}
                          title={hasOrders ? 'Cannot delete — tracker has sales' : 'Delete tracker'}
                        >
                          <Trash2 className={`size-4 ${hasOrders ? 'text-zinc-300' : 'text-red-500'}`} />
                        </Button>
                      )
                    })()}
                  </>
                )
              })()}
              <Button onClick={handleTabSubmit} disabled={tabSaving || !tabForm.label.trim()}>{tabSaving ? 'Saving...' : (editingTabId ? 'Save Changes' : 'Create Tracker')}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete tracker confirmation */}
      <Dialog open={!!deleteTrackerTarget} onOpenChange={(open) => { if (!open) { setDeleteTrackerTarget(null); setDeleteTrackerConfirm('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Sales Tracker</DialogTitle>
            <DialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{deleteTrackerTarget?.label}</span> and all orders within it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Type <span className="font-mono font-bold">delete</span> to confirm</Label>
              <Input
                value={deleteTrackerConfirm}
                onChange={(e) => setDeleteTrackerConfirm(e.target.value)}
                placeholder="delete"
                autoComplete="off"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setDeleteTrackerTarget(null); setDeleteTrackerConfirm('') }}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deleteTrackerConfirm !== 'delete' || deletingTracker}
                onClick={async () => {
                  setDeletingTracker(true)
                  try {
                    await deleteSeason(deleteTrackerTarget.id)
                    if (activeTab === deleteTrackerTarget.id) {
                      const remaining = activeSeasons.filter((s) => s.id !== deleteTrackerTarget.id)
                      setActiveTab(remaining[0]?.id || '')
                    }
                    setDeleteTrackerTarget(null)
                    setDeleteTrackerConfirm('')
                  } catch (err) {
                    console.error('Failed to delete tracker:', err)
                  } finally {
                    setDeletingTracker(false)
                  }
                }}
              >
                {deletingTracker ? 'Deleting...' : 'Delete Forever'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Sale dialog — single step, multi-row */}
      <Dialog open={saleDialogOpen} onOpenChange={(open) => { if (!open) closeSaleDialog() }}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          showCloseButton={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Company logo + name banner */}
          <div className="flex items-center justify-center gap-3 pb-2">
            {company?.logo_path && (
              <img src={company.logo_path} alt={company.name} className="w-10 h-10 object-contain" />
            )}
            <span className="text-xl font-bold text-zinc-900">{company?.name}</span>
          </div>

          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Sale' : 'Add Sale'}</DialogTitle>
            <DialogDescription>
              {isEditMode ? 'Update this sale.' : 'Add one or more sales quickly.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {saleRows.map((row, idx) => {
              const rowAccounts = row.accountSearch.trim()
                ? accounts.filter((a) => a.name.toLowerCase().includes(row.accountSearch.toLowerCase())).slice(0, 10)
                : accounts.slice(0, 10)
              const showDetailsSection = isEditMode || row.showDetails

              return (
                <div key={idx} className="space-y-3">
                  {/* Row divider + remove */}
                  {(!isEditMode && saleRows.length > 1) && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 border-t border-zinc-200 dark:border-zinc-700" />
                      <span className="text-xs text-muted-foreground font-medium">Sale {idx + 1}</span>
                      <div className="flex-1 border-t border-zinc-200 dark:border-zinc-700" />
                      <button
                        type="button"
                        onClick={() => removeSaleRow(idx)}
                        className="text-red-500 hover:text-red-700 p-0.5"
                        title="Remove row"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Account — first field, full width */}
                  <div className="space-y-2">
                    <Label>Account</Label>
                    {isEditMode ? (
                      <Input value={row.clientName} disabled />
                    ) : (
                      <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) updateSaleRow(idx, 'showAccountDropdown', false) }}>
                        {row.client_id ? (
                          <div className="flex items-center gap-2 border rounded-md px-3 h-9 bg-white dark:bg-zinc-700">
                            <span className="text-sm font-medium flex-1">{row.clientName}</span>
                            <button
                              type="button"
                              onClick={() => {
                                updateSaleRow(idx, 'client_id', null)
                                updateSaleRow(idx, 'clientName', '')
                              }}
                              className="text-muted-foreground hover:text-zinc-700"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                              <input
                                placeholder="Search accounts..."
                                value={row.accountSearch}
                                onChange={(e) => {
                                  updateSaleRow(idx, 'accountSearch', e.target.value)
                                  updateSaleRow(idx, 'showAccountDropdown', true)
                                }}
                                onFocus={() => updateSaleRow(idx, 'showAccountDropdown', true)}
                                className="w-full border rounded-md pl-7 pr-3 h-9 text-sm bg-white dark:bg-zinc-700 dark:border-zinc-600"
                              />
                            </div>
                            {row.showAccountDropdown && (
                              <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border dark:border-zinc-700 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto" tabIndex={-1}>
                                {rowAccounts.map((account) => (
                                  <button
                                    key={account.id}
                                    type="button"
                                    onClick={() => {
                                      updateSaleRow(idx, 'client_id', account.id)
                                      updateSaleRow(idx, 'clientName', account.name)
                                      updateSaleRow(idx, 'accountSearch', '')
                                      updateSaleRow(idx, 'showAccountDropdown', false)
                                    }}
                                    className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                  >
                                    <span className="font-medium">{account.name}</span>
                                    <span className="text-muted-foreground ml-2">{account.city}, {account.state}</span>
                                  </button>
                                ))}
                                {rowAccounts.length === 0 && (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">No accounts found</div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Order Type + Sales Tracker — same row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Order Type</Label>
                      <select
                        value={row.sale_type}
                        onChange={(e) => updateSaleRow(idx, 'sale_type', e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                      >
                        <option value="Pre-Book">Pre-Book</option>
                        <option value="At Once">At Once</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Sales Tracker</Label>
                      <select
                        value={row.season_id || currentSeason?.id || ''}
                        onChange={(e) => updateSaleRow(idx, 'season_id', e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                      >
                        {activeSeasons.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Total + Commission % + Close Date — same row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Total <span className="text-red-500">*</span></Label>
                      <div className="flex items-center border rounded-md px-3 h-9 focus-within:ring-2 focus-within:ring-ring">
                        <span className="text-sm text-muted-foreground select-none">$</span>
                        <input
                          inputMode="numeric"
                          placeholder="0.00"
                          value={centsToDisplay(row.total)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '')
                            updateSaleRow(idx, 'total', digits)
                          }}
                          className="flex-1 text-sm bg-transparent outline-none ml-1 w-0"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Commission %</Label>
                      <div className="flex items-center border rounded-md px-3 h-9 focus-within:ring-2 focus-within:ring-ring">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          placeholder={String(company?.commission_percent || 0)}
                          value={row.commission_override}
                          onChange={(e) => updateSaleRow(idx, 'commission_override', e.target.value)}
                          className="flex-1 text-sm bg-transparent outline-none no-spinner w-0"
                        />
                        <span className="text-sm text-muted-foreground select-none">%</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Close Date</Label>
                      <Input
                        type="date"
                        value={row.close_date}
                        onChange={(e) => updateSaleRow(idx, 'close_date', e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  {/* Additional Details toggle */}
                  {!isEditMode && (
                    <button
                      type="button"
                      onClick={() => updateSaleRow(idx, 'showDetails', !row.showDetails)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      {row.showDetails ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      {row.showDetails ? 'Hide Additional Details' : 'Add Additional Details'}
                    </button>
                  )}

                  {/* Additional Details section */}
                  {showDetailsSection && (
                    <div className="space-y-4 border-l-2 border-zinc-200 dark:border-zinc-700 pl-3 ml-1">
                      {/* Category + Order # — same row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Category</Label>
                          <select
                            value={row.order_type}
                            onChange={(e) => {
                              const newType = e.target.value
                              const rate = getExpectedRate(newType)
                              updateSaleRow(idx, 'order_type', newType)
                              updateSaleRow(idx, 'commission_override', String(rate))
                            }}
                            className="w-full border rounded-md px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                          >
                            <option value="">Select category...</option>
                            {companyOrderTypes.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label>Order #</Label>
                            <input
                              ref={(el) => { orderDocRefs.current[idx] = el }}
                              type="file"
                              onChange={(e) => handleOrderDocUpload(e, idx)}
                              className="hidden"
                            />
                            {row.order_document ? (
                              <Badge variant="secondary" className="gap-1 text-xs">
                                <FileText className="size-3" /> {row.order_document.name}
                                <button type="button" onClick={() => updateSaleRow(idx, 'order_document', null)}>
                                  <X className="size-3" />
                                </button>
                              </Badge>
                            ) : (
                              <button
                                type="button"
                                onClick={() => orderDocRefs.current[idx]?.click()}
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                              >
                                <Upload className="size-3" /> Upload Doc
                              </button>
                            )}
                          </div>
                          <Input
                            value={row.order_number}
                            onChange={(e) => updateSaleRow(idx, 'order_number', e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Items Ordered */}
                      <div className="space-y-2">
                        <Label>Items Ordered</Label>
                        {companyItems.length > 0 ? (
                          <div className="flex flex-wrap gap-x-4 gap-y-2 border rounded-md p-3">
                            {companyItems.map((item) => (
                              <label key={item} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={row.items.includes(item)}
                                  onChange={() => toggleItem(idx, item)}
                                  className="size-4 rounded border-zinc-300"
                                />
                                {item}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground border rounded-md p-3">
                            No items configured. Add items in the Settings tab.
                          </p>
                        )}
                      </div>

                      {/* Stage */}
                      <div className="space-y-2">
                        <Label>Stage</Label>
                        <select
                          value={row.stage}
                          onChange={(e) => handleStageChange(idx, e.target.value)}
                          className="w-full border rounded-md px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                        >
                          {companyStages.map((stage) => (
                            <option key={stage} value={stage}>{stage}</option>
                          ))}
                        </select>
                      </div>

                      {/* Notes */}
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <textarea
                          className="w-full border rounded-md px-3 py-2 text-sm min-h-16 resize-y"
                          placeholder="Any notes about this sale..."
                          value={row.notes}
                          onChange={(e) => updateSaleRow(idx, 'notes', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add Row button (add mode only) */}
            {!isEditMode && (
              <button
                type="button"
                onClick={addSaleRow}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus className="size-4" /> Add Row
              </button>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeSaleDialog}>Cancel</Button>
            <Button
              onClick={handleSaleSubmit}
              disabled={isEditMode
                ? !saleRows[0]?.client_id || !centsToFloat(saleRows[0]?.total)
                : saleRows.every((r) => !r.client_id || !centsToFloat(r.total))
              }
            >
              {isEditMode ? 'Save Changes' : saleRows.filter((r) => r.client_id && centsToFloat(r.total) > 0).length > 1 ? 'Add Sales' : 'Add Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes modal */}
      <Dialog open={noteModalOpen} onOpenChange={setNoteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {noteOrderId && orders.find((o) => o.id === noteOrderId)?.notes ? 'Edit Note' : 'Add Note'}
            </DialogTitle>
            <DialogDescription>
              {noteOrderId && getAccountName(orders.find((o) => o.id === noteOrderId)?.client_id)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm min-h-24 resize-y"
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNoteModalOpen(false)}>Cancel</Button>
              <Button onClick={saveNote}>Save Note</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ImportSalesModal open={importSalesOpen} onOpenChange={setImportSalesOpen} companyId={companyId} />

      {/* Celebration popup after adding a sale */}
      <Dialog open={celebrationOpen} onOpenChange={setCelebrationOpen}>
        <DialogContent className="max-w-sm text-center overflow-hidden">
          <DialogTitle className="sr-only">Sale Added</DialogTitle>
          <DialogDescription className="sr-only">Celebration popup showing commission earned</DialogDescription>
          <div className="relative py-4">
            {/* Animated background confetti dots */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full animate-bounce"
                  style={{
                    backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][i % 6],
                    left: `${8 + (i * 8)}%`,
                    top: `${10 + (i % 3) * 30}%`,
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: `${0.8 + (i % 3) * 0.4}s`,
                  }}
                />
              ))}
            </div>

            <div className="relative z-10 space-y-4">
              <div className="text-5xl animate-bounce" style={{ animationDuration: '1s' }}>
                {company?.logo_path ? (
                  <img src={company.logo_path} alt="" className="w-16 h-16 object-contain mx-auto" />
                ) : (
                  <PartyPopper className="size-16 mx-auto text-amber-500" />
                )}
              </div>

              <div className="space-y-2">
                <p className="text-lg font-bold text-zinc-900">
                  {celebrationData.hypeMessage}
                </p>
                <p className="text-4xl font-black text-green-600 tracking-tight animate-pulse">
                  {fmt(celebrationData.commission)}
                </p>
                <p className="text-lg font-bold text-zinc-900">
                  {celebrationData.hypeCloser}
                </p>
              </div>

              <Button
                onClick={() => setCelebrationOpen(false)}
                className="mt-4 bg-[#005b5b] hover:bg-[#007a7a] text-white font-bold px-8"
              >
                LET'S GO!
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Short Shipped confirmation dialog */}
      <Dialog open={shortShipConfirmOpen} onOpenChange={(open) => {
        if (!open) {
          if (shortShipRowIndex != null) updateSaleRow(shortShipRowIndex, 'stage', previousStage)
          setShortShipConfirmOpen(false)
          setShortShipRowIndex(null)
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Short Shipped</DialogTitle>
            <DialogDescription>
              Are you sure there are no more items to ship on this order? The pending amount will be excluded from your total sales and commission.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (shortShipRowIndex != null) updateSaleRow(shortShipRowIndex, 'stage', previousStage)
              setShortShipConfirmOpen(false)
              setShortShipRowIndex(null)
            }}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShortShipConfirmOpen(false); setShortShipRowIndex(null) }}>
              Confirm Short Shipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group invoice modal */}
      <Dialog open={groupInvoiceOpen} onOpenChange={(open) => {
        if (!open) { setGroupInvoiceOpen(false); setGroupInvoiceClientId(null); setGroupInvoiceList([]) }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Invoices</DialogTitle>
            <DialogDescription>
              {groupInvoiceClientId && getAccountName(groupInvoiceClientId)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {groupInvoiceList.length > 0 && (
              <div className="space-y-2">
                {groupInvoiceList.map((inv, idx) => (
                  <div key={idx} className="flex items-center gap-2 border rounded-md p-2 bg-zinc-50 dark:bg-zinc-800">
                    <div className="flex-1 space-y-1">
                      <Input
                        placeholder="Invoice #"
                        value={inv.number}
                        onChange={(e) => updateGroupInvoice(idx, 'number', e.target.value)}
                        className="h-8 text-sm"
                      />
                      <div className="flex items-center border rounded-md px-2 h-8 bg-white focus-within:ring-2 focus-within:ring-ring">
                        <span className="text-xs text-muted-foreground select-none">$</span>
                        <input
                          inputMode="numeric"
                          placeholder="0.00"
                          value={inv.amount ? centsToDisplay(String(inv.amount)) : ''}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '')
                            updateGroupInvoice(idx, 'amount', digits || '')
                          }}
                          className="flex-1 text-xs bg-transparent outline-none ml-1"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <input
                        ref={(el) => { groupInvoiceDocRefs.current[idx] = el }}
                        type="file"
                        onChange={(e) => handleGroupInvoiceDocUpload(e, idx)}
                        className="hidden"
                      />
                      {inv.document ? (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <FileText className="size-3" />
                          <span className="max-w-20 truncate">{inv.document.name}</span>
                          <button type="button" onClick={() => updateGroupInvoice(idx, 'document', null)}>
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => groupInvoiceDocRefs.current[idx]?.click()}
                          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                        >
                          <Upload className="size-3" /> Doc
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeGroupInvoice(idx)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {/* Pending indicator */}
                {groupInvoiceClientId && (() => {
                  const groupOrders = seasonOrders.filter((o) => o.client_id === groupInvoiceClientId)
                  const groupTotal = groupOrders.reduce((sum, o) => sum + o.total, 0)
                  const invoicedTotal = groupInvoiceList.reduce((sum, inv) => {
                    const amt = inv.amount ? parseInt(String(inv.amount).replace(/\D/g, ''), 10) / 100 : 0
                    return sum + amt
                  }, 0)
                  const pending = groupTotal - invoicedTotal
                  if (pending > 0) {
                    return (
                      <p className="text-xs text-amber-600 font-medium">
                        Pending: {fmt(pending)} of {fmt(groupTotal)}
                      </p>
                    )
                  }
                  return null
                })()}
              </div>
            )}
            <button
              type="button"
              onClick={addGroupInvoice}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-zinc-300 dark:border-zinc-600 rounded-md whitespace-nowrap flex items-center gap-1 transition-colors"
            >
              <Plus className="size-3.5" /> Add Invoice
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGroupInvoiceOpen(false); setGroupInvoiceClientId(null); setGroupInvoiceList([]) }}>
              Cancel
            </Button>
            <Button onClick={saveGroupInvoices}>Save Invoices</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search and summary */}
      {(currentSeason || isAllView) && (
        <>
          {/* Summary cards — dynamic per order type */}
          <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(Object.keys(orderTypeTotals).length + 2, 5)}, minmax(0, 1fr))` }}>
            <div
              className={`bg-white dark:bg-zinc-800 border-2 rounded-xl px-4 py-3 cursor-pointer transition-all ${!filterOrderType ? 'border-[#005b5b]' : 'border-[#005b5b]/30 dark:border-zinc-700'}`}
              onClick={() => setFilterOrderType('')}
            >
              <p className="text-xs text-[#005b5b] uppercase tracking-wide">Total Sales</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-white">{fmt(totalSales)}</p>
            </div>
            {Object.entries(orderTypeTotals).map(([type, total]) => (
              <div
                key={type}
                className={`bg-white dark:bg-zinc-800 border-2 rounded-xl px-4 py-3 cursor-pointer transition-all ${filterOrderType === type ? 'border-[#005b5b]' : 'border-[#005b5b]/30 dark:border-zinc-700'}`}
                onClick={() => setFilterOrderType(filterOrderType === type ? '' : type)}
              >
                <p className="text-xs text-[#005b5b] uppercase tracking-wide">{type}</p>
                <p className="text-lg font-bold text-zinc-900 dark:text-white">{fmt(total)}</p>
              </div>
            ))}
            <div className="bg-white dark:bg-zinc-800 border-2 border-[#005b5b]/30 dark:border-zinc-700 rounded-xl px-4 py-3">
              <p className="text-xs text-[#005b5b] uppercase tracking-wide">Total Commish</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-white">{fmt(totalCommission)}</p>
            </div>
          </div>

          {/* Sticky search bar */}
          <div className="sticky top-[107px] z-20 bg-background pb-2 pt-1 space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search account, order #, invoice #, total..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setImportSalesOpen(true)}>
                <Upload className="size-4 mr-1" /> Import Sales
              </Button>
            </div>

            {(filterOrderType || filterStage) && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Filters:</span>
                {filterOrderType && (
                  <Badge variant="secondary" className="gap-1">
                    Category: {filterOrderType}
                    <button onClick={() => setFilterOrderType('')} className="ml-1 hover:text-red-500">
                      <X className="size-3" />
                    </button>
                  </Badge>
                )}
                {filterStage && (
                  <Badge variant="secondary" className="gap-1">
                    Stage: {filterStage}
                    <button onClick={() => setFilterStage('')} className="ml-1 hover:text-red-500">
                      <X className="size-3" />
                    </button>
                  </Badge>
                )}
                <button
                  onClick={() => { setFilterOrderType(''); setFilterStage('') }}
                  className="text-muted-foreground hover:text-zinc-700 dark:hover:text-zinc-300 text-xs underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Orders table */}
          <div style={{ minWidth: '1200px' }}>
            <Table>
              <TableHeader className="sticky top-[149px] z-[15]">
                <TableRow className="bg-[#005b5b] hover:bg-[#005b5b]">
                  <TableHead className="text-white cursor-pointer select-none" onClick={() => toggleSort('account')}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Account <SortIcon column="account" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white">
                    <span className="whitespace-nowrap">Order Type</span>
                  </TableHead>
                  {isAllView && (
                    <TableHead className="text-white">
                      <span className="whitespace-nowrap">Tracker</span>
                    </TableHead>
                  )}
                  <TableHead className="text-white">
                    <div className="relative flex items-center gap-1">
                      <button
                        className="flex items-center gap-1 hover:text-zinc-200 whitespace-nowrap"
                        onClick={() => { setShowOrderTypeFilter(!showOrderTypeFilter); setShowStageFilter(false) }}
                      >
                        Category
                        <Filter className={`size-3 ${filterOrderType ? 'text-amber-300' : ''}`} />
                      </button>
                      {showOrderTypeFilter && (
                        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-800 border dark:border-zinc-700 rounded-lg shadow-lg z-20 min-w-32">
                          <button
                            onClick={() => { setFilterOrderType(''); setShowOrderTypeFilter(false) }}
                            className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 ${!filterOrderType ? 'font-medium text-zinc-900' : 'text-muted-foreground'}`}
                          >
                            All
                          </button>
                          {uniqueOrderTypes.map((type) => (
                            <button
                              key={type}
                              onClick={() => { setFilterOrderType(type); setShowOrderTypeFilter(false) }}
                              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 ${filterOrderType === type ? 'font-medium text-zinc-900' : 'text-muted-foreground'}`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-white">
                    <span className="whitespace-nowrap">Items Ordered</span>
                  </TableHead>
                  <TableHead className="text-white">
                    <span className="whitespace-nowrap">Order #</span>
                  </TableHead>
                  <TableHead className="text-white">
                    <span className="whitespace-nowrap">Close Date</span>
                  </TableHead>
                  <TableHead className="text-white">
                    <div className="relative flex items-center gap-1">
                      <button
                        className="flex items-center gap-1 hover:text-zinc-200 whitespace-nowrap"
                        onClick={() => { setShowStageFilter(!showStageFilter); setShowOrderTypeFilter(false) }}
                      >
                        Stage
                        <Filter className={`size-3 ${filterStage ? 'text-amber-300' : ''}`} />
                      </button>
                      <button onClick={() => toggleSort('stage')} className="hover:text-zinc-200"><SortIcon column="stage" sortConfig={sortConfig} /></button>
                      {showStageFilter && (
                        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-800 border dark:border-zinc-700 rounded-lg shadow-lg z-20 min-w-40">
                          <button
                            onClick={() => { setFilterStage(''); setShowStageFilter(false) }}
                            className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 ${!filterStage ? 'font-medium text-zinc-900' : 'text-muted-foreground'}`}
                          >
                            All
                          </button>
                          {uniqueStages.map((stage) => (
                            <button
                              key={stage}
                              onClick={() => { setFilterStage(stage); setShowStageFilter(false) }}
                              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 ${filterStage === stage ? 'font-medium text-zinc-900' : 'text-muted-foreground'}`}
                            >
                              {stage}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-white text-right cursor-pointer select-none" onClick={() => toggleSort('total')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Total <SortIcon column="total" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white text-right cursor-pointer select-none" onClick={() => toggleSort('commission')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Commission <SortIcon column="commission" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white whitespace-nowrap text-center">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAllView ? 11 : 10} className="text-center text-muted-foreground">
                      {searchQuery || filterOrderType || filterStage
                        ? 'No orders match your search or filters.'
                        : 'No orders for this tab.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedOrders.map((group) => (
                    <Fragment key={`group-${group.clientId}`}>
                      {/* Group header row — collapsible */}
                      <TableRow
                        className={`border-t-2 border-[#005b5b]/20 cursor-pointer select-none ${
                        group.isOverpaid ? 'bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30' :
                        group.isShortShipped ? 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30' :
                        'bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/60'
                      }`}
                        onClick={() => toggleGroup(group.clientId)}
                      >
                        <TableCell colSpan={isAllView ? 8 : 7} className="py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-zinc-900 dark:text-white text-base">{group.accountName}</span>
                            {group.allInvoices.length > 0 && (
                              <>
                                <span className="text-muted-foreground text-xs">|</span>
                                {group.allInvoices.map((inv, i) => {
                                  const amt = typeof inv.amount === 'number' ? inv.amount : (inv.amount ? parseInt(String(inv.amount).replace(/\D/g, ''), 10) / 100 : 0)
                                  const num = inv.number || '—'
                                  return inv.document ? (
                                    <button
                                      key={i}
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        try {
                                          const url = await getDocumentUrl(inv.document.path)
                                          window.open(url, '_blank')
                                        } catch (err) {
                                          console.error('Failed to get document URL:', err)
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-[#005b5b]/10 hover:bg-[#005b5b]/20 text-[#005b5b] dark:text-[#00b3b3] rounded-md whitespace-nowrap transition-colors"
                                    >
                                      <FileText className="size-3" />
                                      #{num}
                                    </button>
                                  ) : (
                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-[#005b5b]/10 text-[#005b5b] dark:text-[#00b3b3] rounded-md whitespace-nowrap">
                                      #{num}
                                    </span>
                                  )
                                })}
                              </>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); openGroupInvoiceModal(group) }}
                              className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-zinc-300 dark:border-zinc-600 rounded-md whitespace-nowrap flex items-center gap-0.5 transition-colors"
                            >
                              <Plus className="size-3" /> Add Invoice
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <span className="font-bold text-zinc-900 dark:text-white">{fmt(group.total)}</span>
                          {group.isShortShipped && group.unshippedSales > 0 && (
                            <div className="text-xs text-purple-600 font-medium">Updated: {fmt(group.adjustedSale)}</div>
                          )}
                          {group.isOverpaid && (
                            <div className="text-xs text-emerald-600 font-medium">Updated: {fmt(group.overpaidAdjustedSale)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <span className="font-bold text-zinc-900 dark:text-white">{fmt(group.commissionTotal)}</span>
                          {group.isShortShipped && group.unshippedSales > 0 && (
                            <div className="text-xs text-purple-600 font-medium">Updated: {fmt(group.adjustedCommission)}</div>
                          )}
                          {group.isOverpaid && (
                            <div className="text-xs text-emerald-600 font-medium">Updated: {fmt(group.overpaidAdjustedCommission)}</div>
                          )}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>

                      {/* Sub-rows for each order in the group — collapsible */}
                      {!collapsedGroups.has(group.clientId) && group.orders.map((order) => {
                        const isHovered = hoveredRow === order.id
                        const isCancelled = order.stage === 'Cancelled'
                        const isShortShipped = order.stage === 'Short Shipped'
                        const comm = getCommission(order)
                        const hasNote = order.notes && order.notes.trim().length > 0

                        const rowClass = isCancelled
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-400 line-through'
                          : isShortShipped
                            ? 'bg-amber-50 dark:bg-amber-900/20'
                            : ''

                        return (
                          <TableRow
                            key={order.id}
                            onMouseEnter={() => setHoveredRow(order.id)}
                            onMouseLeave={() => setHoveredRow(null)}
                            className={`group dark:text-zinc-300 ${rowClass}`}
                          >
                            <TableCell>
                              <div className={`flex gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditOrder(order)} title="Edit">
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmDeleteId(order.id)} title="Delete">
                                  <Trash2 className="size-3.5 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{(order.sale_type || 'Pre-Book').replace('Prebook', 'Pre-Book')}</TableCell>
                            {isAllView && (
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{getTrackerLabel(order.season_id)}</TableCell>
                            )}
                            <TableCell>
                              <Badge variant="secondary">
                                {order.order_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-36 truncate" title={getItems(order)}>{getItems(order)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(order.order_number || '').split(',').map((num) => num.trim()).filter(Boolean).map((num, i) => (
                                  order.order_document ? (
                                    <button
                                      key={i}
                                      onClick={async () => {
                                        try {
                                          const url = await getDocumentUrl(order.order_document.path)
                                          window.open(url, '_blank')
                                        } catch (err) {
                                          console.error('Failed to get document URL:', err)
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-[#005b5b]/10 hover:bg-[#005b5b]/20 text-[#005b5b] dark:text-[#00b3b3] rounded-md whitespace-nowrap transition-colors"
                                    >
                                      <FileText className="size-3" />
                                      {num}
                                    </button>
                                  ) : (
                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-[#005b5b]/10 text-[#005b5b] dark:text-[#00b3b3] rounded-md whitespace-nowrap">{num}</span>
                                  )
                                ))}
                                {!order.order_number && '—'}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{fmtDate(order.close_date)}</TableCell>
                            <TableCell className="max-w-32 truncate" title={order.stage}>{order.stage}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{fmt(order.total)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                {comm.isOverridden && (
                                  <AlertTriangle className="size-3.5 text-amber-500" title={`Overridden from ${comm.defaultPct}%`} />
                                )}
                                <span className={comm.isOverridden ? 'text-amber-700 font-medium' : ''}>
                                  {fmt(comm.amount)}
                                </span>
                                <span className="text-xs text-muted-foreground ml-0.5">
                                  ({comm.pct}%)
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center w-10">
                              {hasNote ? (
                                <button
                                  onClick={() => openNoteModal(order)}
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-[#005b5b]/10 hover:bg-[#005b5b]/20 transition-colors mx-auto"
                                  title={order.notes}
                                >
                                  <StickyNote className="size-3.5 text-[#005b5b] dark:text-[#00b3b3]" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => openNoteModal(order)}
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors mx-auto"
                                  title="Add note"
                                >
                                  <Plus className="size-3.5 text-zinc-300 dark:text-zinc-600" />
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sale</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sale? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CompanySales
