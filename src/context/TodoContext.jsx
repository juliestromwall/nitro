import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import * as db from '@/lib/db'

const TodoContext = createContext()

const CACHE_KEY = 'rc_cache_todos'

export function TodoProvider({ children }) {
  const { user } = useAuth()
  const [todos, setTodos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || [] } catch { return [] }
  })
  const [loading, setLoading] = useState(() => {
    try { return !JSON.parse(localStorage.getItem(CACHE_KEY))?.length } catch { return true }
  })

  const load = useCallback(async () => {
    if (!user) return
    try {
      const data = await db.fetchTodos()
      setTodos(data)
      localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch (err) {
      console.error('Failed to load todos:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const getTodosByCompany = (companyId) => {
    const companyTodos = todos.filter((t) => t.company_id === companyId)
    return companyTodos.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })
  }

  const getTodosByAccount = (clientId) => {
    const accountTodos = todos.filter((t) => t.client_id === clientId)
    return accountTodos.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })
  }

  const addTodo = async (data) => {
    const maxOrder = todos.reduce((max, t) => Math.max(max, t.sort_order ?? 0), 0)
    const row = await db.insertTodo({
      ...data,
      user_id: user.id,
      completed: false,
      completed_at: null,
      pinned: false,
      sort_order: maxOrder + 1,
    })
    setTodos((prev) => [...prev, row])
    return row
  }

  const updateTodo = async (id, data) => {
    const row = await db.updateTodo(id, data)
    setTodos((prev) => prev.map((t) => (t.id === id ? row : t)))
    return row
  }

  const toggleComplete = async (id) => {
    const todo = todos.find((t) => t.id === id)
    if (!todo) return
    const row = await db.updateTodo(id, {
      completed: !todo.completed,
      completed_at: !todo.completed ? new Date().toISOString().split('T')[0] : null,
    })
    setTodos((prev) => prev.map((t) => (t.id === id ? row : t)))
  }

  const togglePin = async (id) => {
    const todo = todos.find((t) => t.id === id)
    if (!todo) return
    const row = await db.updateTodo(id, { pinned: !todo.pinned })
    setTodos((prev) => prev.map((t) => (t.id === id ? row : t)))
  }

  const reorderTodos = async (companyId, fromIndex, toIndex) => {
    const companyTodos = todos
      .filter((t) => t.company_id === companyId)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
    const otherTodos = todos.filter((t) => t.company_id !== companyId)

    const [moved] = companyTodos.splice(fromIndex, 1)
    companyTodos.splice(toIndex, 0, moved)

    const reordered = companyTodos.map((t, i) => ({ ...t, sort_order: i }))
    setTodos([...otherTodos, ...reordered])

    try {
      await db.updateTodoSortOrders(reordered.map((t) => ({ id: t.id, sort_order: t.sort_order })))
    } catch (err) {
      console.error('Failed to persist todo sort order:', err)
      load()
    }
  }

  const deleteTodo = async (id) => {
    await db.deleteTodo(id)
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <TodoContext.Provider value={{
      todos, loading, getTodosByCompany, getTodosByAccount, addTodo, updateTodo, toggleComplete, togglePin, reorderTodos, deleteTodo,
    }}>
      {children}
    </TodoContext.Provider>
  )
}

export function useTodos() {
  return useContext(TodoContext)
}
