import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'

const features = [
  'Unlimited brands',
  'Unlimited orders',
  'Commission tracking',
  'Payment management',
  'Bulk CSV import',
  'Document attachments',
  'To-do lists',
  'Reporting & exports',
]

function PricingPage() {
  const [selected, setSelected] = useState('annual')

  return (
    <div>
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-teal-50/50 to-white dark:from-teal-950/20 dark:to-zinc-950">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-4">
            Less than a client lunch. Way more ROI.
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            One plan, everything included, no surprise fees. Pick monthly or save with annual — either way, it pays for itself the first time you catch a missing commission.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Monthly */}
            <div
              onClick={() => setSelected('monthly')}
              className={`rounded-2xl p-8 flex flex-col relative bg-white dark:bg-zinc-900 cursor-pointer transition-all duration-200 ${
                selected === 'monthly'
                  ? 'border-2 border-[#005b5b] shadow-lg shadow-[#005b5b]/10'
                  : 'border border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[11px] font-semibold px-3 py-1 rounded-bl-lg rounded-tr-2xl">
                Free 7 Day Trial
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Monthly</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-900 dark:text-white">$15</span>
                <span className="text-zinc-500">/month</span>
              </div>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Billed monthly. Cancel anytime — no guilt trip.</p>

              <ul className="mt-8 space-y-3 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                    <Check className="size-4 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to="/signup?plan=monthly"
                className={`mt-8 block text-center px-6 py-3 font-medium rounded-lg transition-colors ${
                  selected === 'monthly'
                    ? 'bg-[#005b5b] hover:bg-[#007a7a] text-white shadow-lg shadow-[#005b5b]/25'
                    : 'border-2 border-[#005b5b] text-[#005b5b] hover:bg-[#005b5b] hover:text-white'
                }`}
              >
                Start Free Trial
              </Link>
            </div>

            {/* Annual */}
            <div
              onClick={() => setSelected('annual')}
              className={`rounded-2xl p-8 flex flex-col relative bg-white dark:bg-zinc-900 cursor-pointer transition-all duration-200 ${
                selected === 'annual'
                  ? 'border-2 border-[#005b5b] shadow-lg shadow-[#005b5b]/10'
                  : 'border border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[11px] font-semibold px-3 py-1 rounded-bl-lg rounded-tr-2xl">
                Free 7 Day Trial
              </div>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold px-4 py-1 rounded-full shadow-md">
                Save 20%
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Annual</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-900 dark:text-white">$144</span>
                <span className="text-zinc-500">/year</span>
              </div>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">$12/month billed annually. Your future self says thanks.</p>

              <ul className="mt-8 space-y-3 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                    <Check className="size-4 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to="/signup?plan=annual"
                className={`mt-8 block text-center px-6 py-3 font-medium rounded-lg transition-colors ${
                  selected === 'annual'
                    ? 'bg-[#005b5b] hover:bg-[#007a7a] text-white shadow-lg shadow-[#005b5b]/25'
                    : 'border-2 border-[#005b5b] text-[#005b5b] hover:bg-[#005b5b] hover:text-white'
                }`}
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 bg-zinc-50 dark:bg-zinc-900/50 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center text-zinc-900 dark:text-white mb-8">
            Questions we get a lot
          </h2>
          <div className="space-y-6">
            {[
              {
                q: 'Can I cancel anytime?',
                a: 'Yep. No contracts, no cancellation fees, no "are you sure?" emails. You\'ll keep access through the end of your billing period.',
              },
              {
                q: 'Can I switch between monthly and annual?',
                a: 'Absolutely. Swap plans anytime from your account settings. We won\'t make it weird.',
              },
              {
                q: 'Is this priced per brand or per rep?',
                a: 'Neither — one flat price, unlimited brands, unlimited orders. Rep 3 brands or 30, the price is the same.',
              },
              {
                q: 'Do I own my data?',
                a: '100%. It\'s your data — we just organize it for you. Export anytime, no hoops to jump through.',
              },
              {
                q: 'Is my data secure?',
                a: 'Yes. Industry-standard security keeps your data safe and private. We take this seriously so you don\'t have to worry about it.',
              },
              {
                q: 'Can I export my commissions and sales data?',
                a: 'Whenever you want. Clean exports ready for your accountant, your taxes, or that brand that loves asking for reports.',
              },
              {
                q: 'Can I track different commission rates for different brands?',
                a: 'Of course — every brand gets its own rates, structures, and terms. Because no two brands pay the same way. (Wouldn\'t that be nice.)',
              },
              {
                q: 'What if a brand changes my commission rate?',
                a: 'Update it in seconds. REPCOMMISH lets you apply the new rate going forward or retroactively — your call, your records.',
              },
              {
                q: 'Can I track partial or split payments?',
                a: 'Yes. Partial payments, outstanding balances, the whole mess. You\'ll always know exactly what\'s still owed.',
              },
            ].map((faq) => (
              <div key={faq.q}>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">{faq.q}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo CTA */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
            Still on the fence?
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 text-lg">
            We get it — commission math is hard. Let us walk you through it.
          </p>
          <a
            href="https://calendly.com/repcommish"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-8 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-semibold rounded-lg transition-colors text-lg shadow-lg shadow-[#005b5b]/25"
          >
            Schedule a Demo
          </a>
        </div>
      </section>
    </div>
  )
}

export default PricingPage
