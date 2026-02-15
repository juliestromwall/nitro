import { Outlet } from 'react-router-dom'
import MarketingHeader from '@/components/marketing/MarketingHeader'
import MarketingFooter from '@/components/marketing/MarketingFooter'

function MarketingLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-zinc-950">
      <MarketingHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  )
}

export default MarketingLayout
