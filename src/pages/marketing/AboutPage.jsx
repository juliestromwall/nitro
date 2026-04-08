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
              REPCOMMISH was built by an independent sales rep's wife who figured building software was cheaper than the therapy bills from commission season.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 space-y-8">
          <div className="group/problem flex gap-5 cursor-default hover:-translate-y-0.5 transition-all duration-200">
            <div className="shrink-0 w-1 rounded-full bg-rose-400 transition-all duration-200 group-hover/problem:w-1.5 group-hover/problem:shadow-[0_0_8px_rgba(251,113,133,0.5)]" />
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">The Problem</h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                You rep multiple brands. Every brand has different pay schedules, different reporting formats, and different ways of doing things. Your commission tracking system is a spreadsheet held together by prayers and conditional formatting. Every hour you spend reconciling is an hour you're not out closing deals. Sound familiar?
              </p>
            </div>
          </div>

          <div className="group/solution flex gap-5 cursor-default hover:-translate-y-0.5 transition-all duration-200">
            <div className="shrink-0 w-1 rounded-full bg-[#005b5b] transition-all duration-200 group-hover/solution:w-1.5 group-hover/solution:shadow-[0_0_8px_rgba(0,91,91,0.5)]" />
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">The Solution</h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                REPCOMMISH tracks every order across all your brands, auto-calculates commissions, and keeps a running scorecard of what's been paid vs. what's still owed. Think of it as a personal accountant that never sleeps, never miscounts, and never asks for a raise.
              </p>
            </div>
          </div>

          <div className="group/built flex gap-5 cursor-default hover:-translate-y-0.5 transition-all duration-200">
            <div className="shrink-0 w-1 rounded-full bg-amber-500 transition-all duration-200 group-hover/built:w-1.5 group-hover/built:shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">Built Different</h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                We're not another bloated CRM that takes six months to set up and a PhD to navigate. REPCOMMISH does one thing and does it well: it makes sure you know exactly what you're owed and who owes it. Fast to learn, fast to use, and zero features you'll never touch. Spend less time crunching numbers and more time making sales.
              </p>
            </div>
          </div>

          <div className="pt-8 mt-4 text-center">
            <div className="bg-gradient-to-br from-[#005b5b] to-[#003d3d] rounded-2xl py-12 px-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Ready to ditch the spreadsheet?
              </h2>
              <p className="text-teal-100/80 mb-6">You'll be up and running before your coffee gets cold.</p>
              <a
                href="https://app.repcommish.com/signup"
                className="inline-flex items-center px-6 py-3 bg-white text-[#005b5b] font-semibold rounded-lg hover:bg-teal-50 transition-colors shadow-lg"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default AboutPage
