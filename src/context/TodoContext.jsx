import { createContext, useContext, useState } from 'react'
import { todos as initialTodos } from '@/data/mockData'

const TodoContext = createContext()

export function TodoProvider({ children }) {
  const [todos, setTodos] = useState(
    initialTodos.map((t, i) => ({ ...t, pinned: false, sortOrder: i }))
  )

  const getTodosByCompany = (companyId) => {
    const companyTodos = todos.filter((t) => t.companyId === companyId)
    // Pinned first, then by sortOrder
    return companyTodos.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    })
  }

  const addTodo = (data) => {
    const id = Date.now()
    const maxOrder = todos.reduce((max, t) => Math.max(max, t.sortOrder ?? 0), 0)
    const newTodo = { id, completed: false, completedAt: null, pinned: false, sortOrder: maxOrder + 1, ...data }
    setTodos((prev) => [...prev, newTodo])
    return newTodo
  }

  const updateTodo = (id, data) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)))
  }

  const toggleComplete = (id) => {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString().split('T')[0] : null }
          : t
      )
    )
  }

  const togglePin = (id) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)))
  }

  const reorderTodos = (companyId, fromIndex, toIndex) => {
    setTodos((prev) => {
      const companyTodos = prev
        .filter((t) => t.companyId === companyId)
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        })
      const otherTodos = prev.filter((t) => t.companyId !== companyId)

      const [moved] = companyTodos.splice(fromIndex, 1)
      companyTodos.splice(toIndex, 0, moved)

      // Reassign sortOrder
      const reordered = companyTodos.map((t, i) => ({ ...t, sortOrder: i }))
      return [...otherTodos, ...reordered]
    })
  }

  const deleteTodo = (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <TodoContext.Provider value={{
      todos, getTodosByCompany, addTodo, updateTodo, toggleComplete, togglePin, reorderTodos, deleteTodo,
    }}>
      {children}
    </TodoContext.Provider>
  )
}

export function useTodos() {
  return useContext(TodoContext)
}
