import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

const screenshots = [
  { src: '/preview-dashboard.png', alt: 'Multi-brand dashboard with sales and commission overview' },
  { src: '/preview-commission.png', alt: 'Commission tracking with pay status and payment management' },
  { src: '/preview-brand.png', alt: 'Brand dashboard with to-dos, notepad, and calculator' },
]

function HomePage() {
  const { user } = useAuth()
  const [lightbox, setLightbox] = useState(null) // index or null

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
              <span className="bg-gradient-to-r from-[#005b5b] to-teal-500 bg-clip-text text-transparent">Know your commish.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl">
              REPCOMMISH helps independent sales reps track orders, calculate commissions, and manage payments across all their brands — in one simple dashboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/signup"
                className="inline-flex items-center px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-lg shadow-lg shadow-[#005b5b]/25"
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
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-teal-50/60 via-amber-50/20 to-white dark:from-teal-950/20 dark:via-zinc-950 dark:to-zinc-950" />
      </section>

      {/* Features Preview */}
      <section className="py-20 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900/50 dark:to-zinc-950">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-1 rounded-full bg-[#005b5b]" />
          </div>
          <h2 className="text-3xl font-bold text-center text-zinc-900 dark:text-white mb-4">
            Everything you need to manage your commissions
          </h2>
          <p className="text-center text-zinc-600 dark:text-zinc-400 mb-12 max-w-2xl mx-auto">
            Built for independent sales reps — whether you carry one brand or many.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Multi-Brand Dashboard',
                desc: 'See total sales, commissions earned, and commissions owed across all your brands at a glance.',
                color: 'bg-[#005b5b]',
                iconColor: 'text-white',
                icon: (
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
                ),
              },
              {
                title: 'Order Tracking',
                desc: 'Track every order from placement through close with custom categories, stages, and items.',
                color: 'bg-amber-500',
                iconColor: 'text-white',
                icon: (
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                ),
              },
              {
                title: 'Commission Calculator',
                desc: 'Automatic commission calculation with per-brand and per-category rates. Know exactly what you\'re owed.',
                color: 'bg-emerald-500',
                iconColor: 'text-white',
                icon: (
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                ),
              },
              {
                title: 'Payment Management',
                desc: 'Record payments, track what\'s been paid vs. outstanding, and manage bulk payments easily.',
                color: 'bg-violet-500',
                iconColor: 'text-white',
                icon: (
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                ),
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white dark:bg-zinc-800/50 rounded-xl p-6 border border-zinc-200 dark:border-zinc-700/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className={`w-10 h-10 rounded-lg ${feature.color} flex items-center justify-center mb-4 ${feature.iconColor}`}>
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshot / Demo */}
      <section className="py-20 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-1 rounded-full bg-amber-500" />
            </div>
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">See it in action</h2>
            <p className="text-zinc-600 dark:text-zinc-400">A quick look at what's waiting inside.</p>
          </div>

          {/* Stacked screenshots */}
          <div className="group relative mx-auto max-w-3xl h-[420px] md:h-[520px] cursor-pointer">
            {/* Back: Commission (bottom-left, fans out left on hover) */}
            <div
              onClick={() => setLightbox(1)}
              className="absolute w-[85%] transition-all duration-500 ease-out group-hover:translate-x-[-60px] group-hover:translate-y-[30px] group-hover:rotate-[-5deg]"
              style={{ transform: 'rotate(-2.5deg)', left: '-2%', top: '60px', zIndex: 1 }}
            >
              <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-700 shadow-2xl">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-700">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="ml-1.5 text-[10px] text-zinc-400">repcommish.com/app</span>
                </div>
                <img src="/preview-commission.png" alt="Commission tracking" className="w-full" />
              </div>
            </div>

            {/* Middle: Brand (offset right, fans out right on hover) */}
            <div
              onClick={() => setLightbox(2)}
              className="absolute w-[85%] transition-all duration-500 ease-out group-hover:translate-x-[60px] group-hover:translate-y-[20px] group-hover:rotate-[4deg]"
              style={{ transform: 'rotate(1.5deg)', right: '-2%', top: '30px', zIndex: 2 }}
            >
              <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-700 shadow-2xl">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-700">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="ml-1.5 text-[10px] text-zinc-400">repcommish.com/app</span>
                </div>
                <img src="/preview-brand.png" alt="Brand dashboard" className="w-full" />
              </div>
            </div>

            {/* Top: Dashboard (front and center, lifts up on hover) */}
            <div
              onClick={() => setLightbox(0)}
              className="absolute w-[85%] left-[7.5%] transition-all duration-500 ease-out group-hover:translate-y-[-16px] group-hover:rotate-[0deg]"
              style={{ transform: 'rotate(-0.5deg)', top: '0px', zIndex: 3 }}
            >
              <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-700 shadow-2xl group-hover:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.4)]">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-700">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="ml-1.5 text-[10px] text-zinc-400">repcommish.com/app</span>
                </div>
                <img src="/preview-dashboard.png" alt="Multi-brand dashboard" className="w-full" />
              </div>
            </div>
          </div>
          <p className="text-center text-sm text-zinc-400 dark:text-zinc-500 mt-6">Click to explore</p>
        </div>
      </section>

      {/* Lightbox Modal */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white z-50"
          >
            <X className="size-8" />
          </button>

          {/* Previous */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setLightbox((lightbox - 1 + screenshots.length) % screenshots.length)
            }}
            className="absolute left-4 md:left-8 text-white/70 hover:text-white z-50"
          >
            <ChevronLeft className="size-10" />
          </button>

          {/* Image */}
          <div
            className="max-w-6xl w-full bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="ml-2 text-xs text-zinc-400">repcommish.com/app</span>
            </div>
            <img
              src={screenshots[lightbox].src}
              alt={screenshots[lightbox].alt}
              className="w-full object-contain"
            />
          </div>

          {/* Next */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setLightbox((lightbox + 1) % screenshots.length)
            }}
            className="absolute right-4 md:right-8 text-white/70 hover:text-white z-50"
          >
            <ChevronRight className="size-10" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-6 flex gap-2">
            {screenshots.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox(i)
                }}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  i === lightbox ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stats Section */}
      <section className="py-16 bg-zinc-900 dark:bg-zinc-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-[#005b5b] mb-2">5 min</div>
              <div className="text-zinc-400">Setup time</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-amber-400 mb-2">Unlimited</div>
              <div className="text-zinc-400">Brands & orders</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-emerald-400 mb-2">100%</div>
              <div className="text-zinc-400">Commission visibility</div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-[#005b5b] to-[#003d3d]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to take control of your commissions?
          </h2>
          <p className="text-teal-100/80 mb-8 text-lg">
            Join REPCOMMISH and never wonder what you're owed again.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center px-8 py-3 bg-white text-[#005b5b] font-semibold rounded-lg hover:bg-teal-50 transition-colors text-lg shadow-lg"
            >
              Get Started Today
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center px-8 py-3 border-2 border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors text-lg"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default HomePage
