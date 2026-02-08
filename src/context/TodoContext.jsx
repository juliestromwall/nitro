import { createContext, useContext, useState } from 'react'
import { todos as initialTodos } from '@/data/mockData'

const TodoContext = createContext()

export function TodoProvider({ children }) {
  const [todos, setTodos] = useState(initialTodos)

  const getTodosByCompany = (companyId) => todos.filter((t) => t.companyId === companyId)

  const addTodo = (data) => {
    const id = Date.now()
    const newTodo = { id, completed: false, completedAt: null, ...data }
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

  const deleteTodo = (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <TodoContext.Provider value={{ todos, getTodosByCompany, addTodo, updateTodo, toggleComplete, deleteTodo }}>
      {children}
    </TodoContext.Provider>
  )
}

export function useTodos() {
  return useContext(TodoContext)
}
