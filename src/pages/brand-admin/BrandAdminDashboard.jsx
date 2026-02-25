import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Package, DollarSign } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useBrandAdmin } from '@/context/BrandAdminContext'
import { fetchConnectedOrders } from '@/lib/brandAdminDb'

function BrandAdminDashboard() {
  const { connections, repUsers, repCompanies, loading } = useBrandAdmin()
  const [orderStats, setOrderStats] = useState({}) // { `${repId}-${companyId}`: { count, total } }

  // Group connections by rep
  const repGroups = {}
  connections.forEach((conn) => {
    if (!repGroups[conn.rep_id]) repGroups[conn.rep_id] = []
    repGroups[conn.rep_id].push(conn)
  })

  useEffect(() => {
    if (connections.length === 0) return

    // Fetch order stats for each connection
    async function loadStats() {
      const stats = {}
      await Promise.all(
        connections.map(async (conn) => {
          try {
            const orders = await fetchConnectedOrders(conn.rep_id, conn.company_id)
            const total = orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0)
            stats[`${conn.rep_id}-${conn.company_id}`] = { count: orders.length, total }
          } catch {
            stats[`${conn.rep_id}-${conn.company_id}`] = { count: 0, total: 0 }
          }
        })
      )
      setOrderStats(stats)
    }
    loadStats()
  }, [connections])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-300 border-t-[#005b5b]" />
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">Brand Admin Dashboard</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="size-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground">
              Ask a rep to send you an invite link to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Brand Admin Dashboard</h1>

      {Object.entries(repGroups).map(([repId, conns]) => {
        const repUser = repUsers[repId] || {}
        const companies = repCompanies[repId] || []

        return (
          <div key={repId} className="space-y-4">
            <div className="flex items-center gap-3">
              {repUser.avatar_url ? (
                <img src={repUser.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#005b5b] flex items-center justify-center text-white font-bold">
                  {(repUser.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold">{repUser.name || 'Unknown Rep'}</p>
                <p className="text-sm text-muted-foreground">{repUser.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {conns.map((conn) => {
                const company = companies.find((c) => c.id === conn.company_id)
                if (!company) return null
                const stats = orderStats[`${repId}-${conn.company_id}`] || { count: 0, total: 0 }

                return (
                  <Link
                    key={conn.id}
                    to={`/app/reps/${repId}/companies/${conn.company_id}`}
                    className="block"
                  >
                    <Card className="hover:ring-2 hover:ring-[#005b5b]/30 transition-all cursor-pointer">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          {company.logo_path ? (
                            <div className="w-10 h-10 rounded bg-white flex items-center justify-center p-1 border border-zinc-200 dark:border-zinc-700">
                              <img src={company.logo_path} alt="" className="w-full h-full object-contain" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 text-sm font-bold">
                              {company.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <CardTitle className="text-base">{company.name}</CardTitle>
                            <CardDescription>{repUser.name}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Package className="size-4" />
                            <span>{stats.count} orders</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <DollarSign className="size-4" />
                            <span>${stats.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default BrandAdminDashboard
