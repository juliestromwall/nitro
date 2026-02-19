import { useState } from 'react'
import { Mail, MessageCircle, Send, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')

    try {
      const { data, error } = await supabase.functions.invoke('contact-email', {
        body: { name: form.name, email: form.email, message: form.message },
      })

      if (error) throw error

      setStatus('sent')
      setForm({ name: '', email: '', message: '' })
    } catch (err) {
      console.error('Contact form error:', err)
      // Fallback: insert directly into table if edge function fails
      const { error: dbError } = await supabase
        .from('contact_messages')
        .insert({ name: form.name, email: form.email, message: form.message })

      if (dbError) {
        setStatus('error')
        return
      }
      setStatus('sent')
      setForm({ name: '', email: '', message: '' })
    }
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
          <div className="max-w-2xl mx-auto text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-1 rounded-full bg-[#005b5b]" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white mb-4">
              Get in Touch
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Have a question, need help getting set up, or just want to say hi? We'd love to hear from you.
            </p>
          </div>
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-teal-50/60 via-white to-amber-50/20 dark:from-teal-950/20 dark:via-zinc-950 dark:to-zinc-950" />
      </section>

      {/* Contact Options */}
      <section className="py-16 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900/50 dark:to-zinc-950">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Email Card */}
            <a
              href="mailto:hello@repcommish.com"
              className="group bg-white dark:bg-zinc-800/50 rounded-xl p-8 border border-zinc-200 dark:border-zinc-700/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-lg bg-[#005b5b] flex items-center justify-center mb-5">
                <Mail className="size-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                Email Us
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Drop us a line anytime. We typically respond within 24 hours.
              </p>
              <span className="text-[#005b5b] dark:text-teal-400 font-medium text-sm group-hover:underline">
                hello@repcommish.com
              </span>
            </a>

            {/* Quick Chat Card */}
            <div className="bg-white dark:bg-zinc-800/50 rounded-xl p-8 border border-zinc-200 dark:border-zinc-700/50">
              <div className="w-12 h-12 rounded-lg bg-amber-500 flex items-center justify-center mb-5">
                <MessageCircle className="size-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                Quick Questions
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Wondering if REPCOMMISH is right for you? Check out our features and pricing, or ask us below.
              </p>
              <div className="flex gap-3">
                <a href="/features" className="text-[#005b5b] dark:text-teal-400 font-medium text-sm hover:underline">Features</a>
                <span className="text-zinc-300 dark:text-zinc-600">|</span>
                <a href="/pricing" className="text-[#005b5b] dark:text-teal-400 font-medium text-sm hover:underline">Pricing</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ask a Question Form */}
      <section className="py-16 bg-white dark:bg-zinc-950">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-1 rounded-full bg-amber-500" />
            </div>
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">
              Ask a Question
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Fill out the form below and we'll get back to you as soon as possible.
            </p>
          </div>

          {status === 'sent' ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="size-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
                Message received!
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                We've received your message and will get back to you shortly.
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="text-sm text-[#005b5b] dark:text-teal-400 font-medium hover:underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Email
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="What would you like to know?"
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 transition-colors resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'sending'}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#005b5b] hover:bg-[#007a7a] text-white font-medium rounded-lg transition-colors text-sm shadow-lg shadow-[#005b5b]/25 disabled:opacity-50"
              >
                <Send className="size-4" />
                {status === 'sending' ? 'Sending...' : 'Send Message'}
              </button>
              {status === 'error' && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  Something went wrong. Please try again or email us directly at hello@repcommish.com
                </p>
              )}
            </form>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-br from-[#005b5b] to-[#003d3d]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ready to track your commissions?
          </h2>
          <p className="text-teal-100/80 mb-6">
            Get started with REPCOMMISH today.
          </p>
          <a
            href="/signup"
            className="inline-flex items-center px-8 py-3 bg-white text-[#005b5b] font-semibold rounded-lg hover:bg-teal-50 transition-colors text-lg shadow-lg"
          >
            Get Started
          </a>
        </div>
      </section>
    </div>
  )
}

export default ContactPage
