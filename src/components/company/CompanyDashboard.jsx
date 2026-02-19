import { useState, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, Pin, PinOff, GripVertical, ChevronLeft, ChevronRight, DollarSign, TrendingUp, AlertCircle, Check, FileText, Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useSales } from '@/context/SalesContext'
import { useTodos } from '@/context/TodoContext'
import { EXCLUDED_STAGES } from '@/lib/constants'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

function CompanyDashboard({ companyId }) {
  const { orders, commissions, getSeasonsForCompany } = useSales()
  const { active: activeSeasons } = getSeasonsForCompany(companyId)
  const { getTodosByCompany, addTodo, updateTodo, toggleComplete, togglePin, reorderTodos, deleteTodo } = useTodos()
  const { companies } = useCompanies()
  const { accounts, getAccountName } = useAccounts()
  const company = companies.find((c) => c.id === companyId)

  // Tracker selector — flip through company trackers
  const storageKey = `dashboard-tracker-${companyId}`
  const [selectedTrackerId, setSelectedTrackerId] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved && activeSeasons.some((s) => s.id === saved)) return saved
    return activeSeasons[0]?.id || ''
  })

  // Keep selectedTrackerId valid when seasons change
  const trackerIdx = activeSeasons.findIndex((s) => s.id === selectedTrackerId)
  const currentIdx = trackerIdx >= 0 ? trackerIdx : 0
  const currentTracker = activeSeasons[currentIdx]

  const handleTrackerChange = (idx) => {
    const id = activeSeasons[idx]?.id || ''
    setSelectedTrackerId(id)
    localStorage.setItem(storageKey, id)
  }

  // Use the selected tracker's ID for filtering
  const matchingSeasonIds = new Set(currentTracker ? [currentTracker.id] : [])

  // Summary data — filter by all matching seasons
  const seasonOrders = orders.filter((o) => o.company_id === companyId && matchingSeasonIds.has(o.season_id) && !EXCLUDED_STAGES.includes(o.stage))
  const totalSales = seasonOrders.reduce((sum, o) => sum + (o.total || 0), 0)
  const commissionPct = company?.commission_percent || 0

  // Commission calculations from commissions table
  const seasonOrderIds = new Set(seasonOrders.map((o) => o.id))
  const seasonCommissions = commissions.filter((c) => seasonOrderIds.has(c.order_id))
  const commissionDue = totalSales * (commissionPct / 100)
  const commissionPaid = seasonCommissions.reduce((sum, c) => sum + (c.amount_paid || 0), 0)
  const outstanding = Math.max(commissionDue - commissionPaid, 0)

  // To Dos
  const todos = getTodosByCompany(companyId)
  const [todoDialogOpen, setTodoDialogOpen] = useState(false)
  const [editingTodoId, setEditingTodoId] = useState(null)
  const [todoForm, setTodoForm] = useState({
    title: '', note: '', client_id: '', phone: '', due_date: '',
  })

  // Searchable account dropdown state
  const [accountSearch, setAccountSearch] = useState('')
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const accountRef = useRef(null)

  const filteredAccounts = accountSearch
    ? accounts.filter((c) => c.name.toLowerCase().includes(accountSearch.toLowerCase()))
    : accounts

  // Close account dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Drag & drop state
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIndex) {
      reorderTodos(companyId, dragIndex, toIndex)
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const openAddTodo = () => {
    setEditingTodoId(null)
    setTodoForm({ title: '', note: '', client_id: '', phone: '', due_date: '' })
    setAccountSearch('')
    setTodoDialogOpen(true)
  }

  const openEditTodo = (todo) => {
    setEditingTodoId(todo.id)
    setTodoForm({
      title: todo.title,
      note: todo.note || '',
      client_id: todo.client_id ? String(todo.client_id) : '',
      phone: todo.phone || '',
      due_date: todo.due_date || '',
    })
    setAccountSearch(todo.client_id ? getAccountName(todo.client_id) : '')
    setTodoDialogOpen(true)
  }

  const selectAccount = (account) => {
    setTodoForm((p) => ({ ...p, client_id: String(account.id) }))
    setAccountSearch(account.name)
    setAccountDropdownOpen(false)
  }

  const clearAccount = () => {
    setTodoForm((p) => ({ ...p, client_id: '' }))
    setAccountSearch('')
  }

  const handleSaveTodo = async (e) => {
    e.preventDefault()
    const data = {
      title: todoForm.title,
      note: todoForm.note,
      client_id: todoForm.client_id ? parseInt(todoForm.client_id) : null,
      phone: todoForm.phone,
      due_date: todoForm.due_date || null,
      company_id: companyId,
    }
    if (editingTodoId) {
      await updateTodo(editingTodoId, data)
    } else {
      await addTodo(data)
    }
    setTodoDialogOpen(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = (todo) => !todo.completed && todo.due_date && todo.due_date < today

  // Notepad — persisted in localStorage
  const notepadKey = `notepad-${companyId}`
  const [notepadText, setNotepadText] = useState(() => localStorage.getItem(notepadKey) || '')
  const handleNotepadChange = (text) => {
    setNotepadText(text)
    localStorage.setItem(notepadKey, text)
  }

  // Calculator state
  const [calcDisplay, setCalcDisplay] = useState('0')
  const [calcPrev, setCalcPrev] = useState(null)
  const [calcOp, setCalcOp] = useState(null)
  const [calcNewInput, setCalcNewInput] = useState(true)
  const calcDisplayRef = useRef(null)

  const handleCalcKeyDown = (e) => {
    const key = e.key
    if (/^[0-9.]$/.test(key)) { e.preventDefault(); calcInput(key) }
    else if (key === '+') { e.preventDefault(); calcOperation('+') }
    else if (key === '-') { e.preventDefault(); calcOperation('-') }
    else if (key === '*') { e.preventDefault(); calcOperation('*') }
    else if (key === '/') { e.preventDefault(); calcOperation('/') }
    else if (key === 'Enter' || key === '=') { e.preventDefault(); calcEquals() }
    else if (key === 'Escape') { e.preventDefault(); calcClear() }
    else if (key === 'Backspace') {
      e.preventDefault()
      setCalcDisplay(prev => prev.length <= 1 ? '0' : prev.slice(0, -1))
      setCalcNewInput(false)
    }
  }

  const calcInput = (digit) => {
    if (calcNewInput) {
      setCalcDisplay(digit === '.' ? '0.' : digit)
      setCalcNewInput(false)
    } else {
      if (digit === '.' && calcDisplay.includes('.')) return
      setCalcDisplay(calcDisplay + digit)
    }
  }

  const calcExecute = (a, b, op) => {
    switch (op) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return b !== 0 ? a / b : 0
      default: return b
    }
  }

  const calcOperation = (op) => {
    const current = parseFloat(calcDisplay)
    if (calcPrev !== null && calcOp && !calcNewInput) {
      const result = calcExecute(calcPrev, current, calcOp)
      setCalcDisplay(String(parseFloat(result.toFixed(10))))
      setCalcPrev(result)
    } else {
      setCalcPrev(current)
    }
    setCalcOp(op)
    setCalcNewInput(true)
  }

  const calcEquals = () => {
    if (calcPrev !== null && calcOp) {
      const current = parseFloat(calcDisplay)
      const result = calcExecute(calcPrev, current, calcOp)
      setCalcDisplay(String(parseFloat(result.toFixed(10))))
      setCalcPrev(null)
      setCalcOp(null)
      setCalcNewInput(true)
    }
  }

  const calcClear = () => {
    setCalcDisplay('0')
    setCalcPrev(null)
    setCalcOp(null)
    setCalcNewInput(true)
  }

  const fmtDueDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    if (isNaN(d)) return dateStr
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Tracker selector */}
      {activeSeasons.length > 0 && (
        <div className="flex items-center">
          <button
            onClick={() => handleTrackerChange(currentIdx - 1)}
            disabled={currentIdx === 0}
            className="px-2 py-1.5 text-[#005b5b] hover:bg-[#005b5b]/10 rounded-l-md border border-[#005b5b]/30 border-r-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="px-4 py-1.5 bg-[#005b5b] text-white text-sm font-semibold select-none min-w-[120px] text-center">
            {currentTracker?.label || '—'}
          </div>
          <button
            onClick={() => handleTrackerChange(currentIdx + 1)}
            disabled={currentIdx >= activeSeasons.length - 1}
            className="px-2 py-1.5 text-[#005b5b] hover:bg-[#005b5b]/10 rounded-r-md border border-[#005b5b]/30 border-l-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {/* Summary cards — white with teal border and colored icon badges */}
      <div className="grid grid-cols-4 gap-4">
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-800 border-2 border-[#005b5b]/30 dark:border-zinc-700 rounded-xl px-4 py-3">
          <div className="p-2 bg-[#005b5b] rounded-lg">
            <DollarSign className="size-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Total Sales</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-white">{fmt(totalSales)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-800 border-2 border-[#005b5b]/30 dark:border-zinc-700 rounded-xl px-4 py-3">
          <div className="p-2 bg-emerald-600 rounded-lg">
            <TrendingUp className="size-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Commish Earned</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-white">{fmt(commissionDue)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-800 border-2 border-[#005b5b]/30 dark:border-zinc-700 rounded-xl px-4 py-3">
          <div className="p-2 bg-green-600 rounded-lg">
            <Check className="size-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Commish Paid</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-white">{fmt(commissionPaid)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-800 border-2 border-[#005b5b]/30 dark:border-zinc-700 rounded-xl px-4 py-3">
          <div className="p-2 bg-amber-500 rounded-lg">
            <AlertCircle className="size-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Commish Due</p>
            <p className="text-lg font-bold text-red-600">{fmt(outstanding)}</p>
          </div>
        </div>
      </div>

      {/* Two-column layout: To Dos (left) | Notepad + Calculator (right) */}
      <div className="grid grid-cols-5 gap-6">
        {/* To Dos — left column (3/5 width) */}
        <div className="col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">To Dos</h2>
            <Button data-tour="add-todo" size="sm" onClick={openAddTodo}>
              <Plus className="size-4 mr-1" /> Add To Do
            </Button>
          </div>

          <div className="border dark:border-zinc-700 rounded-xl overflow-hidden">
            {todos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No to-dos yet.
              </div>
            ) : (
              <div className="divide-y">
                {todos.map((todo, index) => (
                  <div
                    key={todo.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-start gap-2 px-3 py-2.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors ${
                      dragOverIndex === index && dragIndex !== index ? 'border-t-2 border-t-blue-500' : ''
                    } ${dragIndex === index ? 'opacity-40' : ''} ${
                      isOverdue(todo) ? 'border-l-3 border-l-red-500' : ''
                    }`}
                  >
                    <div className="cursor-grab active:cursor-grabbing pt-1 shrink-0">
                      <GripVertical className="size-3.5 text-muted-foreground" />
                    </div>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleComplete(todo.id)}
                      className="size-4 rounded border-zinc-300 mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${todo.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {todo.title}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {todo.client_id && (
                          <span className="truncate max-w-[120px]">{getAccountName(todo.client_id)}</span>
                        )}
                        {todo.due_date && (
                          <span className={isOverdue(todo) ? 'text-red-600 font-medium' : ''}>
                            {fmtDueDate(todo.due_date)}
                          </span>
                        )}
                        {todo.note && (
                          <span className="truncate max-w-[250px]" title={todo.note}>{todo.note}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => togglePin(todo.id)}
                        title={todo.pinned ? 'Unpin' : 'Pin to top'}
                      >
                        {todo.pinned ? (
                          <PinOff className="size-3 text-blue-500" />
                        ) : (
                          <Pin className="size-3" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditTodo(todo)} title="Edit">
                        <Pencil className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteTodo(todo.id)} title="Delete">
                        <Trash2 className="size-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Notepad + Calculator (2/5 width) */}
        <div className="col-span-2 space-y-6">
          {/* Notepad */}
          <div data-tour="notepad" className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-[#005b5b]" />
              <h2 className="text-lg font-semibold">Notepad</h2>
            </div>
            <textarea
              className="w-full border rounded-xl px-4 py-3 text-sm min-h-[180px] resize-y bg-amber-50/50 dark:bg-amber-900/10 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#005b5b]/30"
              placeholder="Quick notes..."
              value={notepadText}
              onChange={(e) => handleNotepadChange(e.target.value)}
            />
          </div>

          {/* Calculator */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calculator className="size-4 text-[#005b5b]" />
              <h2 className="text-lg font-semibold">Calculator</h2>
            </div>
            <div className="border rounded-xl bg-white dark:bg-zinc-800 p-3 space-y-2">
              <div
                ref={calcDisplayRef}
                tabIndex={0}
                onKeyDown={handleCalcKeyDown}
                className="bg-zinc-900 rounded-lg px-4 py-3 text-right text-white text-xl font-mono tracking-wide cursor-text outline-none focus:ring-2 focus:ring-[#005b5b]"
              >
                {calcDisplay.includes('.')
                  ? calcDisplay.replace(/^(-?\d+)/, (m) => Number(m).toLocaleString())
                  : Number(calcDisplay).toLocaleString()}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[['7','7'],['8','8'],['9','9'],['/','÷'],['4','4'],['5','5'],['6','6'],['*','×'],['1','1'],['2','2'],['3','3'],['-','−'],['0','0'],['.','.'],['=','='],['+','+']].map(([op, label]) => (
                  <button
                    key={op}
                    onClick={() => {
                      if (op === '=') calcEquals()
                      else if (['+','-','*','/'].includes(op)) calcOperation(op)
                      else calcInput(op)
                    }}
                    className={`py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                      ['+','-','*','/'].includes(op)
                        ? 'bg-[#005b5b] text-white hover:bg-[#007a7a]'
                        : op === '='
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={calcClear}
                  className="col-span-4 py-2 text-sm font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit To Do dialog */}
      <Dialog open={todoDialogOpen} onOpenChange={setTodoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTodoId ? 'Edit To Do' : 'Add To Do'}</DialogTitle>
            <DialogDescription>
              {editingTodoId ? 'Update this to-do item.' : 'Create a new to-do item.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTodo} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={todoForm.title}
                onChange={(e) => setTodoForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="What needs to be done?"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm min-h-16 resize-y dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                value={todoForm.note}
                onChange={(e) => setTodoForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="Additional details..."
              />
            </div>
            <div className="space-y-2">
              <Label>Account</Label>
              <div className="relative" ref={accountRef}>
                <Input
                  value={accountSearch}
                  onChange={(e) => {
                    setAccountSearch(e.target.value)
                    setAccountDropdownOpen(true)
                    if (!e.target.value) {
                      setTodoForm((p) => ({ ...p, client_id: '' }))
                    }
                  }}
                  onFocus={() => setAccountDropdownOpen(true)}
                  placeholder="Search accounts..."
                  autoComplete="off"
                />
                {todoForm.client_id && (
                  <button
                    type="button"
                    onClick={clearAccount}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <span className="text-xs">✕</span>
                  </button>
                )}
                {accountDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-800 border dark:border-zinc-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredAccounts.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No accounts found</div>
                    ) : (
                      filteredAccounts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectAccount(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                            String(c.id) === todoForm.client_id ? 'bg-zinc-50 dark:bg-zinc-700 font-medium' : ''
                          }`}
                        >
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={todoForm.phone}
                  onChange={(e) => setTodoForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={todoForm.due_date}
                  onChange={(e) => setTodoForm((p) => ({ ...p, due_date: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">{editingTodoId ? 'Save Changes' : 'Add To Do'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CompanyDashboard
