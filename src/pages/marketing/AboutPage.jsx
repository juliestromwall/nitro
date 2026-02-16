import { Link } from 'react-router-dom'

function AboutPage() {
  return (
    <div>
      <section className="py-20 bg-gradient-to-b from-teal-50/50 to-white dark:from-teal-950/20 dark:to-zinc-950">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-6">
            About REPCOMMISH
          </h1>
          <div className="prose prose-zinc dark:prose-invert max-w-none">
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              REPCOMMISH was built by an independent sales rep who was tired of tracking commissions in spreadsheets.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 space-y-8">
          <div className="flex gap-5">
            <div className="shrink-0 w-1 rounded-full bg-rose-400" />
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">The Problem</h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                When you're an independent sales rep working with multiple brands, keeping track of what you've sold, what commission you've earned, and what's actually been paid gets complicated fast. Spreadsheets break down. Details slip through the cracks. You end up spending hours reconciling instead of selling.
              </p>
            </div>
          </div>

          <div className="flex gap-5">
            <div className="shrink-0 w-1 rounded-full bg-[#005b5b]" />
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">The Solution</h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                REPCOMMISH is purpose-built for independent reps. It tracks your orders across all your brands, automatically calculates commissions based on your negotiated rates, and keeps a clear record of what's been paid and what's outstanding. No more guessing, no more spreadsheet headaches.
              </p>
            </div>
          </div>

          <div className="flex gap-5">
            <div className="shrink-0 w-1 rounded-full bg-amber-500" />
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">Built Different</h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                Unlike bloated enterprise CRMs, REPCOMMISH is focused on what matters to independent reps: tracking sales, knowing your commission, and getting paid. It's fast, simple, and designed to stay out of your way so you can focus on selling.
              </p>
            </div>
          </div>

          <div className="pt-8 mt-4 text-center">
            <div className="bg-gradient-to-br from-[#005b5b] to-[#003d3d] rounded-2xl py-12 px-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Ready to try it?
              </h2>
              <p className="text-teal-100/80 mb-6">Start tracking your commissions in minutes.</p>
              <Link
                to="/signup"
                className="inline-flex items-center px-6 py-3 bg-white text-[#005b5b] font-semibold rounded-lg hover:bg-teal-50 transition-colors shadow-lg"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default AboutPage
