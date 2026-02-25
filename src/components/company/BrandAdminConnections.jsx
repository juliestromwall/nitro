import { useState, useEffect } from 'react'
import { Users, Shield, ShieldOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'

function BrandAdminConnections({ companyId }) {
  const [connections, setConnections] = useState([])
  const [userDetails, setUserDetails] = useState({})
  const [loading, setLoading] = useState(true)
  const [revokeTarget, setRevokeTarget] = useState(null)

  useEffect(() => {
    loadConnections()
  }, [companyId])

  async function loadConnections() {
    try {
      const { data, error } = await supabase
        .from('brand_connections')
        .select('*')
        .eq('company_id', companyId)
        .neq('status', 'revoked')
        .order('created_at', { ascending: false })

      if (error) throw error
      setConnections(data || [])

      // Fetch user details for brand admins
      if (data && data.length > 0) {
        const adminIds = [...new Set(data.map((c) => c.brand_admin_id))]
        const { data: { session } } = await supabase.auth.getSession()
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

        const response = await fetch(`${supabaseUrl}/functions/v1/get-connected-users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ userIds: adminIds }),
        })

        const result = await response.json()
        if (response.ok) setUserDetails(result.users || {})
      }
    } catch (err) {
      console.error('Failed to load connections:', err)
    } finally {
      setLoading(false)
    }
  }

  async function toggleSharing(connectionId, currentValue) {
    try {
      const { error } = await supabase
        .from('brand_connections')
        .update({ sharing_enabled: !currentValue })
        .eq('id', connectionId)

      if (error) throw error
      setConnections((prev) =>
        prev.map((c) => c.id === connectionId ? { ...c, sharing_enabled: !currentValue } : c)
      )
    } catch (err) {
      console.error('Failed to toggle sharing:', err)
    }
  }

  async function revokeConnection() {
    if (!revokeTarget) return
    try {
      const { error } = await supabase
        .from('brand_connections')
        .update({ status: 'revoked', sharing_enabled: false })
        .eq('id', revokeTarget)

      if (error) throw error
      setConnections((prev) => prev.filter((c) => c.id !== revokeTarget))
    } catch (err) {
      console.error('Failed to revoke connection:', err)
    } finally {
      setRevokeTarget(null)
    }
  }

  if (loading || connections.length === 0) return null

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Connected Brand Admins</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.map((conn) => {
            const adminUser = userDetails[conn.brand_admin_id] || {}
            return (
              <div key={conn.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                {adminUser.avatar_url ? (
                  <img src={adminUser.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-600 flex items-center justify-center text-xs font-bold">
                    {(adminUser.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{adminUser.name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground truncate">{adminUser.email || ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleSharing(conn.id, conn.sharing_enabled)}
                    title={conn.sharing_enabled ? 'Sharing enabled — click to pause' : 'Sharing paused — click to enable'}
                  >
                    {conn.sharing_enabled ? (
                      <Shield className="size-4 text-green-500" />
                    ) : (
                      <ShieldOff className="size-4 text-zinc-400" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRevokeTarget(conn.id)}
                    title="Revoke connection"
                  >
                    <X className="size-4 text-zinc-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Revoke confirmation */}
      <Dialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Revoke Connection</DialogTitle>
            <DialogDescription>This brand admin will lose access to your data for this brand. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={revokeConnection}>Revoke</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default BrandAdminConnections
