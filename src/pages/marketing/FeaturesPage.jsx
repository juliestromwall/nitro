import { Link } from 'react-router-dom'
import { BarChart3, Package, DollarSign, CreditCard, Upload, Users, Sun, ListTodo } from 'lucide-react'

const features = [
  {
    icon: BarChart3,
    title: 'Multi-Brand Dashboard',
    desc: 'See sales, commissions earned, and commissions owed across all your brands in one view. Filter by season year and track progress with visual progress bars.',
    color: 'bg-[#005b5b]',
  },
  {
    icon: Package,
    title: 'Order Tracking',
    desc: 'Track every order with custom categories (rental, retail, etc.), items, stages, and close dates. Import orders in bulk via CSV or add them one by one.',
    color: 'bg-amber-500',
  },
  {
    icon: DollarSign,
    title: 'Automatic Commission Calculation',
    desc: 'Set commission rates per brand and per category. REPCOMMISH automatically calculates what you\'re owed on every order.',
    color: 'bg-emerald-500',
  },
  {
    icon: CreditCard,
    title: 'Payment Management',
    desc: 'Record individual or bulk payments, track partial vs. full payment status, and see complete payment history grouped by date.',
    color: 'bg-violet-500',
  },
  {
    icon: Users,
    title: 'Account Management',
    desc: 'Manage all your retail accounts in one place. Add individually, import from CSV, and track which accounts belong to which region.',
    color: 'bg-rose-500',
  },
  {
    icon: ListTodo,
    title: 'Per-Brand To-Do Lists',
    desc: 'Keep track of tasks for each brand with pinnable, reorderable to-do items. Never miss a follow-up or deadline.',
    color: 'bg-sky-500',
  },
  {
    icon: Upload,
    title: 'Document Attachments',
    desc: 'Attach invoices, purchase orders, and other documents directly to orders. Private storage with secure signed URLs.',
    color: 'bg-orange-500',
  },
  {
    icon: Sun,
    title: 'Dark Mode',
    desc: 'Full dark mode support across the entire app. Toggle with one click from the top bar.',
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
            Features built for sales reps
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            REPCOMMISH gives you everything you need to track sales, calculate commissions, and manage payments — without the complexity of enterprise software.
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
            Ready to get started?
          </h2>
          <p className="text-teal-100/80 mb-6">
            Start tracking your commissions today.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center px-6 py-3 bg-white text-[#005b5b] font-semibold rounded-lg hover:bg-teal-50 transition-colors shadow-lg"
          >
            Sign Up Now
          </Link>
        </div>
      </section>
    </div>
  )
}

export default FeaturesPage
