import { Link } from 'react-router-dom'
import { BarChart3, Package, DollarSign, CreditCard, Upload, Users, FileDown, ListTodo } from 'lucide-react'

const features = [
  {
    icon: BarChart3,
    title: 'Multi-Brand Dashboard',
    desc: 'All your brands, one screen — total sales, commissions earned, and what\'s owed. No more flipping between 12 tabs like a maniac.',
    color: 'bg-[#005b5b]',
  },
  {
    icon: Package,
    title: 'Order Tracking',
    desc: 'Every order from "just placed" to "closed and celebrating." Import in bulk or add one at a time — whatever matches your chaos style.',
    color: 'bg-amber-500',
  },
  {
    icon: DollarSign,
    title: 'Automatic Commission Calculation',
    desc: 'Set your rates, and we\'ll do the math. Per brand, per category, down to the penny. Your calculator app can finally retire.',
    color: 'bg-emerald-500',
  },
  {
    icon: CreditCard,
    title: 'Payment Management',
    desc: 'Track who paid, who partially paid, and who\'s pretending your invoice got lost in spam. Full payment history, zero guesswork.',
    color: 'bg-violet-500',
  },
  {
    icon: Users,
    title: 'Account Management',
    desc: 'All your accounts in one place with contacts, notes, and quick views. Import from CSV or build your book one account at a time.',
    color: 'bg-rose-500',
  },
  {
    icon: ListTodo,
    title: 'To-Do Lists',
    desc: 'Follow-ups, deadlines, "call that guy back" — pin it, drag it, check it off. Your brain has enough to remember.',
    color: 'bg-sky-500',
  },
  {
    icon: Upload,
    title: 'Document Attachments',
    desc: 'Attach invoices, POs, and anything else you\'d normally lose in your email. Securely stored and always where you left them.',
    color: 'bg-orange-500',
  },
  {
    icon: FileDown,
    title: 'Reporting & Exports',
    desc: 'Clean exports for your records, your accountant, or that brand that keeps asking "can you send that again?" Yes. Yes you can.',
    color: 'bg-zinc-700',
  },
]

function FeaturesPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-teal-50/50 to-white dark:from-teal-950/20 dark:to-zinc-950">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-4">
            Built for reps, not IT departments
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            Everything you need to track what you sell and collect what you're owed — nothing you don't. No training manual required.
          </p>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex gap-4 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className={`shrink-0 w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center`}>
                  <feature.icon className="size-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">{feature.title}</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-br from-[#005b5b] to-[#003d3d]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Seen enough?
          </h2>
          <p className="text-teal-100/80 mb-6">
            Ditch the spreadsheet. You've got sales to make.
          </p>
          <a
            href="https://app.repcommish.com/signup"
            className="inline-flex items-center px-6 py-3 bg-white text-[#005b5b] font-semibold rounded-lg hover:bg-teal-50 transition-colors shadow-lg"
          >
            Sign Up Now
          </a>
        </div>
      </section>
    </div>
  )
}

export default FeaturesPage
