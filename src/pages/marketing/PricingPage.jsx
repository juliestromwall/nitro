import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'

const features = [
  'Unlimited brands',
  'Unlimited orders',
  'Commission tracking',
  'Payment management',
  'Bulk CSV import',
  'Document attachments',
  'Per-brand to-do lists',
  'Dark mode',
]

function PricingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-teal-50/50 to-white dark:from-teal-950/20 dark:to-zinc-950">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            One plan with everything included. Choose monthly or save with annual billing.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Monthly */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 flex flex-col">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Monthly</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-900 dark:text-white">$9</span>
                <span className="text-zinc-500">/month</span>
              </div>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Billed monthly. Cancel anytime.</p>

              <ul className="mt-8 space-y-3 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                    <Check className="size-4 text-[#005b5b] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to="/signup?plan=monthly"
                className="mt-8 block text-center px-6 py-3 border-2 border-[#005b5b] text-[#005b5b] hover:bg-[#005b5b] hover:text-white font-medium rounded-lg transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Annual */}
            <div className="rounded-2xl border-2 border-[#005b5b] p-8 flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#005b5b] text-white text-xs font-semibold px-3 py-1 rounded-full">
                Save 33%
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Annual</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-900 dark:text-white">$72</span>
                <span className="text-zinc-500">/year</span>
              </div>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">$6/month billed annually.</p>

              <ul className="mt-8 space-y-3 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                    <Check className="size-4 text-[#005b5b] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to="/signup?plan=annual"
                className="mt-8 block text-center px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-zinc-50 dark:bg-zinc-900/50">
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
                q: 'Is there a free trial?',
                a: 'We don\'t currently offer a free trial, but you can cancel within the first 7 days for a full refund.',
              },
              {
                q: 'Can I switch between monthly and annual?',
                a: 'Yes, you can switch plans at any time from your account settings.',
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
