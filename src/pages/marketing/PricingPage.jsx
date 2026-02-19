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
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            One plan with everything included. Pay monthly or save with annual billing.
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
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Billed monthly. Cancel anytime.</p>

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
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">$12/month billed annually.</p>

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
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: 'Can I cancel anytime?',
                a: 'Yes! You can cancel your subscription at any time. You\'ll keep access through the end of your billing period.',
              },
              {
                q: 'Can I switch between monthly and annual?',
                a: 'Yes, you can switch plans at any time from your account settings.',
              },
              {
                q: 'Is this priced per brand or per rep?',
                a: 'Neither. Pricing is per subscription — not per brand, order, or commission.',
              },
              {
                q: 'Do I own my data?',
                a: 'Yes. Your data is always yours. You can export your data at any time.',
              },
              {
                q: 'Is my data secure?',
                a: 'Yes. REPCOMMISH uses industry-standard security practices to keep your data safe and private.',
              },
              {
                q: 'Can I export my commissions and sales data?',
                a: 'Yes. You can export your data whenever you need — whether for accounting, taxes, or your own records.',
              },
              {
                q: 'Can I track different commission rates for different brands?',
                a: 'Yes. REPCOMMISH supports multiple brands with different commission structures, rates, and terms.',
              },
              {
                q: 'What if a brand changes my commission rate?',
                a: 'You can update commission rates at any time, and REPCOMMISH will give you the option to update all or apply them going forward so your records stay accurate.',
              },
              {
                q: 'Can I track partial or split payments?',
                a: 'Yes. You can track partial payments and outstanding balances so you always know exactly what you\'re still owed.',
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
    </div>
  )
}

export default PricingPage
