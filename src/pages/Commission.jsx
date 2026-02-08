import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCompanies } from '@/context/CompanyContext'

function Commission() {
  const { activeCompanies } = useCompanies()

  return (
    <div className="px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Commission</h1>
      <p className="text-muted-foreground">Select a company to view commission tracking.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeCompanies.map((company) => (
          <Link key={company.id} to={`/companies/${company.id}`}>
            <Card className="hover:border-zinc-400 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-3 py-4">
                {company.logo ? (
                  <img src={company.logo} alt="" className="w-10 h-10 object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded bg-zinc-200 flex items-center justify-center text-zinc-600 text-sm font-bold shrink-0">
                    {company.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{company.name}</p>
                  <Badge variant="outline" className="text-xs">{company.commissionPercent}%</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Commission
