import { useState, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, Pin, PinOff, GripVertical, ChevronDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { clients, commissions, companies } from '@/data/mockData'
import { useSales } from '@/context/SalesContext'
import { useTodos } from '@/context/TodoContext'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getClientName = (clientId) => {
  const client = clients.find((c) => c.id === clientId)
  return client ? client.name : 'Unknown'
}

function CompanyDashboard({ companyId }) {
  const { activeSeasons, orders } = useSales()
  const { getTodosByCompany, addTodo, updateTodo, toggleComplete, togglePin, reorderTodos, deleteTodo } = useTodos()
  const company = companies.find((c) => c.id === companyId)

  // Season selector persisted in localStorage
  const storageKey = `dashboard-season-${companyId}`
  const [selectedSeasonId, setSelectedSeasonId] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved && activeSeasons.find((s) => s.id === saved)) return saved
    return activeSeasons[0]?.id || ''
  })

  const handleSeasonChange = (id) => {
    setSelectedSeasonId(id)
    localStorage.setItem(storageKey, id)
  }

  // Summary data
  const seasonOrders = orders.filter((o) => o.companyId === companyId && o.seasonId === selectedSeasonId)
  const totalSales = seasonOrders.reduce((sum, o) => sum + o.total, 0)
  const commissionPct = company?.commissionPercent || 0

  // Commission calculations — go through orders to find relevant clients
  const companyClientIds = [...new Set(orders.filter((o) => o.companyId === companyId).map((o) => o.clientId))]
  const seasonCommissions = commissions.filter(
    (c) => c.seasonId === selectedSeasonId && companyClientIds.includes(c.clientId)
  )
  const commissionDue = totalSales * (commissionPct / 100)
  const commissionPaid = seasonCommissions.reduce((sum, c) => sum + c.amountPaid, 0)
  const outstanding = Math.max(commissionDue - commissionPaid, 0)

  // To Dos
  const todos = getTodosByCompany(companyId)
  const [todoDialogOpen, setTodoDialogOpen] = useState(false)
  const [editingTodoId, setEditingTodoId] = useState(null)
  const [todoForm, setTodoForm] = useState({
    title: '', note: '', clientId: '', phone: '', dueDate: '',
  })

  // Searchable account dropdown state
  const [accountSearch, setAccountSearch] = useState('')
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const accountRef = useRef(null)

  const filteredClients = accountSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(accountSearch.toLowerCase()))
    : clients

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
    setTodoForm({ title: '', note: '', clientId: '', phone: '', dueDate: '' })
    setAccountSearch('')
    setTodoDialogOpen(true)
  }

  const openEditTodo = (todo) => {
    setEditingTodoId(todo.id)
    setTodoForm({
      title: todo.title,
      note: todo.note || '',
      clientId: todo.clientId ? String(todo.clientId) : '',
      phone: todo.phone || '',
      dueDate: todo.dueDate || '',
    })
    setAccountSearch(todo.clientId ? getClientName(todo.clientId) : '')
    setTodoDialogOpen(true)
  }

  const selectClient = (client) => {
    setTodoForm((p) => ({ ...p, clientId: String(client.id) }))
    setAccountSearch(client.name)
    setAccountDropdownOpen(false)
  }

  const clearClient = () => {
    setTodoForm((p) => ({ ...p, clientId: '' }))
    setAccountSearch('')
  }

  const handleSaveTodo = (e) => {
    e.preventDefault()
    const data = {
      title: todoForm.title,
      note: todoForm.note,
      clientId: todoForm.clientId ? parseInt(todoForm.clientId) : null,
      phone: todoForm.phone,
      dueDate: todoForm.dueDate,
      companyId,
    }
    if (editingTodoId) {
      updateTodo(editingTodoId, data)
    } else {
      addTodo(data)
    }
    setTodoDialogOpen(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = (todo) => !todo.completed && todo.dueDate && todo.dueDate < today

  return (
    <div className="space-y-6">
      {/* Season selector */}
      <div className="flex items-center gap-3">
        <Label className="text-sm text-muted-foreground">Season</Label>
        <div className="relative">
          <select
            value={selectedSeasonId}
            onChange={(e) => handleSeasonChange(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm pr-8 appearance-none bg-white"
          >
            {activeSeasons.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commission Due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(commissionDue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commission Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(commissionPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{fmt(outstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {/* To Dos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">To Dos</h2>
          <Button size="sm" onClick={openAddTodo}>
            <Plus className="size-4 mr-1" /> Add To Do
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-10"></TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {todos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No to-dos yet.
                </TableCell>
              </TableRow>
            ) : (
              todos.map((todo, index) => (
                <TableRow
                  key={todo.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`${
                    dragOverIndex === index && dragIndex !== index ? 'border-t-2 border-t-blue-500' : ''
                  } ${dragIndex === index ? 'opacity-40' : ''} ${
                    isOverdue(todo) ? 'border-l-2 border-l-red-500' : ''
                  }`}
                >
                  <TableCell className="cursor-grab active:cursor-grabbing">
                    <GripVertical className="size-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleComplete(todo.id)}
                      className="size-4 rounded border-zinc-300"
                    />
                  </TableCell>
                  <TableCell className={`font-medium ${todo.completed ? 'line-through text-muted-foreground' : ''}`}>
                    {todo.title}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                    {todo.note || '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {todo.clientId ? getClientName(todo.clientId) : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{todo.phone || '—'}</TableCell>
                  <TableCell className={`whitespace-nowrap ${isOverdue(todo) ? 'text-red-600 font-medium' : ''}`}>
                    {todo.dueDate || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => togglePin(todo.id)}
                        title={todo.pinned ? 'Unpin' : 'Pin to top'}
                      >
                        {todo.pinned ? (
                          <PinOff className="size-3.5 text-blue-500" />
                        ) : (
                          <Pin className="size-3.5" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTodo(todo)} title="Edit">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteTodo(todo.id)} title="Delete">
                        <Trash2 className="size-3.5 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
                className="w-full border rounded-md px-3 py-2 text-sm min-h-16 resize-y"
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
                      setTodoForm((p) => ({ ...p, clientId: '' }))
                    }
                  }}
                  onFocus={() => setAccountDropdownOpen(true)}
                  placeholder="Search accounts..."
                  autoComplete="off"
                />
                {todoForm.clientId && (
                  <button
                    type="button"
                    onClick={clearClient}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <span className="text-xs">✕</span>
                  </button>
                )}
                {accountDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No accounts found</div>
                    ) : (
                      filteredClients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectClient(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 ${
                            String(c.id) === todoForm.clientId ? 'bg-zinc-50 font-medium' : ''
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
                  value={todoForm.dueDate}
                  onChange={(e) => setTodoForm((p) => ({ ...p, dueDate: e.target.value }))}
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
