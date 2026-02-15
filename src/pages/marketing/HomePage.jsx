import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Navigate } from 'react-router-dom'

function HomePage() {
  const { user } = useAuth()

  // Redirect authenticated users to the app
  if (user) {
    return <Navigate to="/app" replace />
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Track your sales.{' '}
              <span className="text-[#005b5b]">Know your commission.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl">
              RepCommish helps independent sales reps track orders, calculate commissions, and manage payments across all their brands — in one simple dashboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/signup"
                className="inline-flex items-center px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-lg"
              >
                Get Started
              </Link>
              <Link
                to="/features"
                className="inline-flex items-center px-6 py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium rounded-lg transition-colors text-lg"
              >
                See Features
              </Link>
            </div>
          </div>
        </div>
        {/* Background gradient */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-teal-50/50 via-white to-white dark:from-teal-950/20 dark:via-zinc-950 dark:to-zinc-950" />
      </section>

      {/* Features Preview */}
      <section className="py-20 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-zinc-900 dark:text-white mb-4">
            Everything you need to manage your commissions
          </h2>
          <p className="text-center text-zinc-600 dark:text-zinc-400 mb-12 max-w-2xl mx-auto">
            Built specifically for independent sales reps who work with multiple brands.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Multi-Brand Dashboard',
                desc: 'See total sales, commissions earned, and commissions owed across all your brands at a glance.',
                icon: '📊',
              },
              {
                title: 'Order Tracking',
                desc: 'Track every order from placement through close with custom categories, stages, and items.',
                icon: '📦',
              },
              {
                title: 'Commission Calculator',
                desc: 'Automatic commission calculation with per-brand and per-category rates. Know exactly what you\'re owed.',
                icon: '💰',
              },
              {
                title: 'Payment Management',
                desc: 'Record payments, track what\'s been paid vs. outstanding, and manage bulk payments easily.',
                icon: '✅',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white dark:bg-zinc-800 rounded-xl p-6 border border-zinc-200 dark:border-zinc-700"
              >
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshot / Demo */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-700 shadow-2xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="ml-2 text-xs text-zinc-400">repcommish.com/app</span>
            </div>
            <img
              src="/hero-dashboard.jpg"
              alt="Analytics dashboard on laptop"
              className="w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-[#005b5b]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to take control of your commissions?
          </h2>
          <p className="text-teal-100 mb-8 text-lg">
            Join RepCommish and never wonder what you're owed again.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center px-8 py-3 bg-white text-[#005b5b] font-semibold rounded-lg hover:bg-teal-50 transition-colors text-lg"
          >
            Get Started Today
          </Link>
        </div>
      </section>
    </div>
  )
}

export default HomePage
