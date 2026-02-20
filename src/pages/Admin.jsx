import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { USER_ROLES, ROLE_LABELS } from '@/lib/constants'
import { Loader2, Check, AlertCircle } from 'lucide-react'

function Admin() {
  const { user, userRole } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState({}) // { [userId]: true }
  const [feedback, setFeedback] = useState({}) // { [userId]: 'success' | 'error message' }

  if (userRole !== 'master_admin') {
    return <Navigate to="/app" replace />
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  const getAuthHeaders = () => {
    const session = JSON.parse(
      localStorage.getItem(
        Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token')) || '{}'
      ) || '{}'
    )
    const token = session?.access_token
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/list-users`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load users')
      setUsers(data.users || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    setUpdating((prev) => ({ ...prev, [userId]: true }))
    setFeedback((prev) => ({ ...prev, [userId]: undefined }))
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/set-user-role`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId, role: newRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update role')

      // Update local state
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
      setFeedback((prev) => ({ ...prev, [userId]: 'success' }))
      setTimeout(() => setFeedback((prev) => ({ ...prev, [userId]: undefined })), 2000)
    } catch (err) {
      setFeedback((prev) => ({ ...prev, [userId]: err.message }))
    } finally {
      setUpdating((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground mt-2">Manage user roles</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-500 py-8">
          <AlertCircle className="size-5" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">User</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Sign In</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                            {u.first_name?.charAt(0)?.toUpperCase() || u.email?.charAt(0)?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="font-medium">
                        {u.first_name || u.last_name
                          ? `${u.first_name} ${u.last_name}`.trim()
                          : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-muted-foreground">{u.email}</td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        disabled={updating[u.id] || u.id === user.id}
                        className="text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-background px-2 py-1 disabled:opacity-50"
                      >
                        {USER_ROLES.map((role) => (
                          <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                      {updating[u.id] && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                      {feedback[u.id] === 'success' && <Check className="size-4 text-emerald-500" />}
                      {feedback[u.id] && feedback[u.id] !== 'success' && (
                        <span className="text-xs text-red-500">{feedback[u.id]}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-muted-foreground">{formatDate(u.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Admin
