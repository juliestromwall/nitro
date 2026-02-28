import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Package, FileText } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useBrandAdmin } from '@/context/BrandAdminContext'
import { fetchConnectedOrders, fetchConnectedClients, fetchConnectedSeasons } from '@/lib/brandAdminDb'
import { getDocumentUrl } from '@/lib/db'

function BrandAdminRepView() {
  const { repId, companyId } = useParams()
  const { repUsers, repCompanies } = useBrandAdmin()
  const [orders, setOrders] = useState([])
  const [clients, setClients] = useState([])
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSeason, setActiveSeason] = useState('all')

  const repUser = repUsers[repId] || {}
  const companies = repCompanies[repId] || []
  const company = companies.find((c) => c.id === parseInt(companyId))

  useEffect(() => {
    loadData()
  }, [repId, companyId])

  async function loadData() {
    try {
      setLoading(true)
      const [orderData, clientData, seasonData] = await Promise.all([
        fetchConnectedOrders(repId, parseInt(companyId)),
        fetchConnectedClients(repId),
        fetchConnectedSeasons(repId, parseInt(companyId)),
      ])
      setOrders(orderData)
      setClients(clientData)
      setSeasons(seasonData)
    } catch (err) {
      console.error('Failed to load rep data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter orders by season
  const filteredOrders = activeSeason === 'all'
    ? orders
    : orders.filter((o) => o.season_id === activeSeason)

  // Group by client
  const ordersByClient = {}
  filteredOrders.forEach((order) => {
    if (!ordersByClient[order.client_id]) ordersByClient[order.client_id] = []
    ordersByClient[order.client_id].push(order)
  })

  const getClientName = (clientId) => {
    const client = clients.find((c) => c.id === clientId)
    return client?.name || `Account #${clientId}`
  }

  async function handleViewDocument(path) {
    try {
      const url = await getDocumentUrl(path)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Failed to get document URL:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-300 border-t-[#005b5b]" />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/app" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-3">
          {company?.logo_path ? (
            <img src={company.logo_path} alt="" className="w-8 h-8 object-contain" />
          ) : (
            <div className="w-8 h-8 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 text-sm font-bold">
              {company?.name?.charAt(0) || '?'}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{company?.name || 'Unknown Brand'}</h1>
            <p className="text-sm text-muted-foreground">Rep: {repUser.name || 'Unknown'}</p>
          </div>
        </div>
      </div>

      {/* Season filter */}
      {seasons.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveSeason('all')}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              activeSeason === 'all'
                ? 'bg-[#005b5b] text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            All Seasons
          </button>
          {seasons.filter((s) => !s.archived).map((season) => (
            <button
              key={season.id}
              onClick={() => setActiveSeason(season.id)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                activeSeason === season.id
                  ? 'bg-[#005b5b] text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {season.label}
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Total Orders</p>
            <p className="text-2xl font-bold">{filteredOrders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Total Sales Volume</p>
            <p className="text-2xl font-bold">
              ${filteredOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Accounts</p>
            <p className="text-2xl font-bold">{Object.keys(ordersByClient).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders grouped by account */}
      {Object.keys(ordersByClient).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="size-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
            <p className="text-muted-foreground">No orders found for this season.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(ordersByClient).map(([clientId, clientOrders]) => (
          <Card key={clientId}>
            <CardHeader>
              <CardTitle className="text-base">{getClientName(parseInt(clientId))}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="text-left py-2 font-medium text-muted-foreground">Order #</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Type</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Stage</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Date</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Docs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientOrders.map((order) => (
                      <tr key={order.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                        <td className="py-2">{order.order_number || '-'}</td>
                        <td className="py-2">{order.order_type}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            order.stage === 'Closed Won' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            order.stage === 'Canceled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {order.stage}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono">${parseFloat(order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-2 text-muted-foreground">{order.close_date || '-'}</td>
                        <td className="py-2">
                          {(order.invoices && order.invoices.length > 0) && (
                            <div className="flex gap-1">
                              {order.invoices.map((doc, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleViewDocument(doc.path)}
                                  title={doc.name}
                                  className="text-[#005b5b] hover:text-[#007a7a]"
                                >
                                  <FileText className="size-4" />
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

export default BrandAdminRepView
