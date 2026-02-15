import { Link } from 'react-router-dom'
import { BarChart3, Package, DollarSign, CreditCard, Upload, Users, Sun, ListTodo } from 'lucide-react'

const features = [
  {
    icon: BarChart3,
    title: 'Multi-Brand Dashboard',
    desc: 'See sales, commissions earned, and commissions owed across all your brands in one view. Filter by season year and track progress with visual progress bars.',
  },
  {
    icon: Package,
    title: 'Order Tracking',
    desc: 'Track every order with custom categories (rental, retail, etc.), items, stages, and close dates. Import orders in bulk via CSV or add them one by one.',
  },
  {
    icon: DollarSign,
    title: 'Automatic Commission Calculation',
    desc: 'Set commission rates per brand and per category. RepCommish automatically calculates what you\'re owed on every order.',
  },
  {
    icon: CreditCard,
    title: 'Payment Management',
    desc: 'Record individual or bulk payments, track partial vs. full payment status, and see complete payment history grouped by date.',
  },
  {
    icon: Users,
    title: 'Account Management',
    desc: 'Manage all your retail accounts in one place. Add individually, import from CSV, and track which accounts belong to which region.',
  },
  {
    icon: ListTodo,
    title: 'Per-Brand To-Do Lists',
    desc: 'Keep track of tasks for each brand with pinnable, reorderable to-do items. Never miss a follow-up or deadline.',
  },
  {
    icon: Upload,
    title: 'Document Attachments',
    desc: 'Attach invoices, purchase orders, and other documents directly to orders. Private storage with secure signed URLs.',
  },
  {
    icon: Sun,
    title: 'Dark Mode',
    desc: 'Full dark mode support across the entire app. Toggle with one click from the top bar.',
  },
]

function FeaturesPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-teal-50/50 to-white dark:from-teal-950/20 dark:to-zinc-950">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-4">
            Features built for sales reps
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            RepCommish gives you everything you need to track sales, calculate commissions, and manage payments — without the complexity of enterprise software.
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
                className="flex gap-4 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-[#005b5b]/30 dark:hover:border-[#005b5b]/30 transition-colors"
              >
                <div className="shrink-0 w-12 h-12 rounded-lg bg-[#005b5b]/10 dark:bg-[#005b5b]/20 flex items-center justify-center">
                  <feature.icon className="size-6 text-[#005b5b] dark:text-teal-400" />
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
      <section className="py-16 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Ready to get started?
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Start tracking your commissions today.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors"
          >
            Sign Up Now
          </Link>
        </div>
      </section>
    </div>
  )
}

export default FeaturesPage
