import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  ArrowRight, ArrowLeft, HelpCircle,
  FileSpreadsheet, Download, X
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCompanies } from '@/context/CompanyContext'
import { useAccounts } from '@/context/AccountContext'
import { supabase } from '@/lib/supabase'

const steps = [
  // 0 — Welcome
  {
    page: '/app',
    target: null,
    placement: 'center',
    title: 'Welcome to REPCOMMISH!',
    body: "We promise this tour is shorter than your average commission payment wait time. We'll show you the ropes so you can see just how easy managing your sales and commissions can be.",
    icon: 'welcome',
  },
  // 1 — Brands nav
  {
    page: '/app',
    target: '[data-tour="nav-brands"]',
    placement: 'right',
    title: 'Brands',
    body: 'This takes you to your Brands page. Brands are the companies you rep for — you\'ll set up commission rates, order types, and product lines for each one.',
  },
  // 2 — Add Brand (FORCED)
  {
    page: '/app/companies',
    target: '[data-tour="add-brand"]',
    placement: 'bottom',
    title: 'Add Your First Brand',
    body: 'Enter their name, commission rate you receive, create custom order categories and items you can sell. While not all fields are required, the more specific you are in your orders, the better your reporting will be.\n\nCategory examples: Retail, Rental\nItem examples: Boards, Jackets, Accessories',
    requireAction: 'brand',
  },
  // 3 — Accounts nav
  {
    page: '/app/companies',
    target: '[data-tour="nav-accounts"]',
    placement: 'right',
    title: 'Accounts',
    body: 'This takes you to your Accounts page — the stores, resorts, and retailers you sell to.',
  },
  // 4 — Add Account
  {
    page: '/app/accounts',
    target: '[data-tour="add-account"]',
    placement: 'bottom',
    title: 'Add an Account',
    body: 'Add accounts one at a time with their region, territory, and location info.',
  },
  // 5 — Import from CSV
  {
    page: '/app/accounts',
    target: '[data-tour="import-csv"]',
    placement: 'bottom',
    title: 'Import from CSV',
    body: 'Already have your accounts in a spreadsheet? Import them all at once. Download our templates to get the right format.',
    templates: 'accounts',
  },
  // 6 — Brand links (click to advance)
  {
    page: '/app/accounts',
    target: '[data-tour="brand-links"]',
    placement: 'right',
    title: 'Brand Dashboards',
    body: 'Click on the brand you created to open its dashboard — this is where you\'ll control all the sales, commissions, and payments for that brand.',
    navigateToBrand: true,
  },
  // 7 — To-Dos (brand detail, dashboard tab)
  {
    page: 'brand-detail',
    target: '[data-tour="add-todo"]',
    placement: 'bottom',
    title: 'To-Dos',
    body: 'Keep track of follow-ups, calls, and tasks for this brand. Add to-dos with due dates, account links, and notes — pin important ones to the top.',
    setTab: 'dashboard',
  },
  // 8 — Notepad (brand detail, dashboard tab)
  {
    page: 'brand-detail',
    target: '[data-tour="notepad"]',
    placement: 'left',
    title: 'Notepad',
    body: 'A quick-access scratchpad for each brand. Jot down notes, reminders, or anything you need — it auto-saves as you type.',
    setTab: 'dashboard',
  },
  // 9 — Sales Tab
  {
    page: 'brand-detail',
    target: '[data-tour="tab-sales"]',
    placement: 'bottom',
    title: 'Sales Tab',
    body: 'This is where all your sales live. Track orders by account, see totals, and manage invoices.',
    setTab: 'sales',
  },
  // 10 — New Sales Tracker
  {
    page: 'brand-detail',
    target: '[data-tour="new-tracker"]',
    placement: 'bottom',
    title: 'New Sales Tracker',
    body: 'Think of trackers like spreadsheets for a sales cycle — 2026-2027, Winter 2025, Spring 2026, etc. Create one for each selling period to keep your orders organized.',
    setTab: 'sales',
  },
  // 11 — Add Sale
  {
    page: 'brand-detail',
    target: '[data-tour="btn-add-sale"]',
    placement: 'bottom',
    title: 'Add Sales',
    body: 'Add individual sales manually — enter the account, order details, invoice info, and totals. You can keep it simple or expand each sale with detailed invoice and item info. You can add multiple line items in one go.',
  },
  // 12 — Import Sales
  {
    page: 'brand-detail',
    target: '[data-tour="btn-import-sales"]',
    placement: 'bottom',
    title: 'Import Sales',
    body: 'Have a batch of sales? Import them from a CSV. Download the template to get the right format.',
    templates: 'sales',
  },
  // 13 — Add Payment
  {
    page: 'brand-detail',
    target: '[data-tour="btn-add-payment"]',
    placement: 'bottom',
    title: 'Add Payment',
    body: 'Record commission payments as they come in. You can add multiple payments at the same time — select the accounts being paid and enter the amounts. We\'ll track what\'s owed vs. paid.',
  },
  // 14 — Import Payments
  {
    page: 'brand-detail',
    target: '[data-tour="btn-import-payments"]',
    placement: 'bottom',
    title: 'Import Payments',
    body: 'Import commission payments from a CSV to track what\'s been paid vs. what\'s still owed. Download the template to get started.',
    templates: 'payments',
  },
  // 15 — Commissions Tab
  {
    page: 'brand-detail',
    target: '[data-tour="tab-commission"]',
    placement: 'bottom',
    title: 'Commissions Tab',
    body: 'See your commission breakdown — what\'s earned, what\'s been paid, and what\'s still owed. This is calculated automatically from your sales and payment data.',
    setTab: 'commission',
  },
  // 16 — Payments Tab
  {
    page: 'brand-detail',
    target: '[data-tour="tab-payments"]',
    placement: 'bottom',
    title: 'Payments Tab',
    body: 'View all recorded commission payments in one place. Track payment history and see outstanding balances.',
    setTab: 'payments',
  },
  // 17 — Dashboard nav
  {
    page: '/app',
    target: '[data-tour="nav-dashboard"]',
    placement: 'right',
    title: 'Dashboard',
    body: 'Your command center — view all your brands\' stats together in one place. See total sales, commissions earned, and commissions owed across every brand.',
  },
  // 18 — Sidebar logo
  {
    page: '/app',
    target: '[data-tour="sidebar-logo"]',
    placement: 'right',
    title: 'Set Your Favorite Page',
    body: 'Navigate to the page you want as your favorite, then long-press or right-click the REPCOMMISH logo to save it. Click it anytime to quick link to that page. You can change it by repeating the same step.',
  },
  // 19 — Reports
  {
    page: '/app',
    target: '[data-tour="nav-reports"]',
    placement: 'right',
    title: 'Reports',
    body: 'Export your data anytime — accounts, brands, sales, commissions, payments, and to-dos as .xlsx or .pdf format.',
  },
  // 20 — User settings
  {
    page: '/app/reports',
    target: '[data-tour="user-settings"]',
    placement: 'bottom-end',
    title: 'User Settings',
    body: 'Click your avatar to update your profile photo, change your email or password, or manage your subscription.',
  },
  // 21 — Help
  {
    page: '/app',
    target: '[data-tour="help-button"]',
    placement: 'bottom-end',
    title: 'Help & Support',
    body: "Got questions? Having a meltdown over commission math? Click here anytime — we've got answers, email support, and the ability to restart this tour if you were \"definitely paying attention\" the first time.",
  },
  // 22 — Finish
  {
    page: '/app',
    target: null,
    placement: 'center',
    title: "You survived the tour!",
    body: "Congratulations on surviving the tour — we knew you had it in you.\n\nNow go add all your brands, accounts, and any sales you want to track. Let REPCOMMISH do the heavy lifting — you've got sales to close.",
    icon: 'finish',
    isLast: true,
  },
]

const PAD = 8       // padding around spotlight
const GAP = 14      // gap between spotlight and tooltip
const TIP_W = 340   // tooltip max-width

export default function OnboardingTour() {
  const { user } = useAuth()
  const { companies } = useCompanies()
  const { accounts } = useAccounts()
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const [fading, setFading] = useState(false)
  const [skipConfirm, setSkipConfirm] = useState(false)
  const tipRef = useRef(null)
  const navigate = useNavigate()

  // Force-step tracking
  const [initialBrandCount, setInitialBrandCount] = useState(null)
  const [initialAccountCount, setInitialAccountCount] = useState(null)
  const [tourBrandId, setTourBrandId] = useState(null)

  const storageKey = user ? `repcommish_tour_done_${user.id}` : null

  // Tour is "done" if EITHER localStorage OR user_metadata says so.
  // This prevents deploys/cache clears from resetting the tour.
  const tourDoneInMeta = !!user?.user_metadata?.tour_done

  // Show on first visit (per-user)
  useEffect(() => {
    if (!storageKey) return
    // If user_metadata says tour is done, sync to localStorage and skip
    if (tourDoneInMeta) {
      localStorage.setItem(storageKey, 'true')
      return
    }
    if (!localStorage.getItem(storageKey)) {
      const t = setTimeout(() => {
        setInitialBrandCount(companies.length)
        setInitialAccountCount(accounts.length)
        setActive(true)
      }, 600)
      return () => clearTimeout(t)
    }
  }, [storageKey, tourDoneInMeta])

  // Restart from settings
  useEffect(() => {
    const handler = () => {
      setStep(0)
      setSkipConfirm(false)
      setInitialBrandCount(companies.length)
      setInitialAccountCount(accounts.length)
      setTourBrandId(null)
      navigate('/app')
      setActive(true)
    }
    window.addEventListener('restart-tour', handler)
    return () => window.removeEventListener('restart-tour', handler)
  }, [navigate, companies.length, accounts.length])

  // Resolve page for current step
  const resolvedPage = useCallback((s) => {
    if (s.page === 'brand-detail' && tourBrandId) return `/app/companies/${tourBrandId}`
    return s.page
  }, [tourBrandId])

  // Measure target element
  const measure = useCallback(() => {
    const s = steps[step]
    if (!s?.target) { setRect(null); return }
    const el = document.querySelector(s.target)
    if (el) {
      setRect(el.getBoundingClientRect())
    } else {
      setRect(null)
    }
  }, [step])

  // Re-measure on step change, resize, scroll
  useEffect(() => {
    if (!active) return
    const s = steps[step]
    const page = resolvedPage(s)

    // Navigate to the correct page
    if (page && page !== 'brand-detail') navigate(page)

    // If step has setTab, dispatch tab change after a small delay
    if (s.setTab) {
      const tabTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('tour-set-tab', { detail: { tab: s.setTab } }))
      }, 250)
      // Measure after tab switch, then fade in
      const t1 = setTimeout(measure, 500)
      const t2 = setTimeout(() => {
        measure()
        setFading(false)
      }, 600)
      window.addEventListener('resize', measure)
      window.addEventListener('scroll', measure, true)
      return () => {
        clearTimeout(tabTimer)
        clearTimeout(t1)
        clearTimeout(t2)
        window.removeEventListener('resize', measure)
        window.removeEventListener('scroll', measure, true)
      }
    }

    // Standard measure passes — first measure, then reveal
    const t1 = setTimeout(measure, 300)
    const t2 = setTimeout(() => {
      measure()
      setFading(false)
    }, 400)

    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, active, measure, navigate, resolvedPage])

  const goTo = useCallback((idx) => {
    if (idx < 0 || idx >= steps.length) return
    setFading(true)
    setSkipConfirm(false)
    // Let the fade-out complete fully, then clear rect so spotlight doesn't flash
    setTimeout(() => {
      setRect(null)
      setStep(idx)
    }, 250)
  }, [])

  // Force logic: check if condition is satisfied
  const s = steps[step]
  const isForced = s?.requireAction === 'brand' || s?.requireAction === 'account'
  let forceSatisfied = false
  if (s?.requireAction === 'brand' && initialBrandCount !== null) {
    forceSatisfied = companies.length > initialBrandCount
  }
  if (s?.requireAction === 'account' && initialAccountCount !== null) {
    forceSatisfied = accounts.length > initialAccountCount
  }

  // Auto-advance when force condition is met
  useEffect(() => {
    if (!active || !isForced || !forceSatisfied) return
    // Capture brand ID for brand-detail steps
    if (s?.requireAction === 'brand' && companies.length > 0) {
      const newest = companies[companies.length - 1]
      if (newest) setTourBrandId(newest.id)
    }
    const t = setTimeout(() => goTo(step + 1), 400)
    return () => clearTimeout(t)
  }, [active, isForced, forceSatisfied, step, goTo, companies, s?.requireAction])

  // Brand link click handler for step 6 (navigateToBrand)
  useEffect(() => {
    if (!active) return
    const s = steps[step]
    if (!s?.navigateToBrand) return

    const attachHandlers = () => {
      const container = document.querySelector('[data-tour="brand-links"]')
      if (!container) return
      const links = container.querySelectorAll('a[href*="/app/companies/"]')
      links.forEach((link) => {
        const handler = (e) => {
          // Extract brand ID from href
          const match = link.getAttribute('href')?.match(/\/app\/companies\/(\d+)/)
          if (match) {
            setTourBrandId(parseInt(match[1]))
            setTimeout(() => goTo(step + 1), 100)
          }
        }
        link.addEventListener('click', handler)
        link._tourBrandHandler = handler
      })
    }

    const t = setTimeout(attachHandlers, 300)
    return () => {
      clearTimeout(t)
      const container = document.querySelector('[data-tour="brand-links"]')
      if (container) {
        const links = container.querySelectorAll('a[href*="/app/companies/"]')
        links.forEach((link) => {
          if (link._tourBrandHandler) {
            link.removeEventListener('click', link._tourBrandHandler)
            delete link._tourBrandHandler
          }
        })
      }
    }
  }, [step, active, goTo])

  // Let user click spotlighted element to advance tour (non-forced, non-brand-link steps)
  useEffect(() => {
    if (!active) return
    const s = steps[step]
    if (!s?.target || s.isLast || s.navigateToBrand || isForced) return
    const t = setTimeout(() => {
      const el = document.querySelector(s.target)
      if (!el) return
      const handler = () => setTimeout(() => goTo(step + 1), 10)
      el.addEventListener('click', handler)
      el._tourHandler = handler
    }, 300)
    return () => {
      clearTimeout(t)
      const el = document.querySelector(s?.target)
      if (el?._tourHandler) {
        el.removeEventListener('click', el._tourHandler)
        delete el._tourHandler
      }
    }
  }, [step, active, goTo, isForced])

  const markTourDone = () => {
    if (storageKey) localStorage.setItem(storageKey, 'true')
    // Persist to user_metadata so it survives localStorage clears / new devices
    supabase.auth.updateUser({ data: { tour_done: true } }).catch(() => {})
  }

  const skip = () => {
    markTourDone()
    setActive(false)
  }

  const finish = () => {
    markTourDone()
    setActive(false)
    navigate('/app/companies')
  }

  if (!active) return null

  const isLast = s.isLast
  const isFirst = step === 0
  const isCentered = !rect || s.placement === 'center'

  // Calculate tooltip position with viewport clamping
  let tipStyle = {}
  let arrowSide = null
  let arrowOffset = null

  if (!isCentered && rect) {
    const p = s.placement
    const vw = window.innerWidth
    const margin = 12

    if (p === 'right') {
      tipStyle = {
        top: rect.top + rect.height / 2,
        left: rect.right + PAD + GAP,
        transform: 'translateY(-50%)',
      }
      arrowSide = 'left'
    } else if (p === 'left') {
      tipStyle = {
        top: rect.top + rect.height / 2,
        left: rect.left - PAD - GAP,
        transform: 'translate(-100%, -50%)',
      }
      arrowSide = 'right'
    } else if (p === 'bottom' || p === 'bottom-end') {
      const tipTop = rect.bottom + PAD + GAP
      let tipLeft = rect.left + rect.width / 2 - TIP_W / 2
      if (tipLeft + TIP_W > vw - margin) tipLeft = vw - margin - TIP_W
      if (tipLeft < margin) tipLeft = margin
      arrowOffset = rect.left + rect.width / 2 - tipLeft
      tipStyle = { top: tipTop, left: tipLeft }
      arrowSide = 'top'
    } else if (p === 'top') {
      let tipLeft = rect.left + rect.width / 2 - TIP_W / 2
      if (tipLeft + TIP_W > vw - margin) tipLeft = vw - margin - TIP_W
      if (tipLeft < margin) tipLeft = margin
      arrowOffset = rect.left + rect.width / 2 - tipLeft
      tipStyle = {
        top: rect.top - PAD - GAP,
        left: tipLeft,
        transform: 'translateY(-100%)',
      }
      arrowSide = 'bottom'
    }
  }

  // Template download links
  const renderTemplates = () => {
    if (!s.templates) return null
    const templates = []
    if (s.templates === 'accounts') {
      templates.push({ href: '/templates/account-import.xlsx', label: 'Account Import Template' })
    } else if (s.templates === 'sales') {
      templates.push({ href: '/templates/sales-import.xlsx', label: 'Sales Import Template' })
    } else if (s.templates === 'payments') {
      templates.push({ href: '/templates/payment-import.xlsx', label: 'Payment Import Template' })
    }
    if (templates.length === 0) return null
    return (
      <div className="flex flex-col gap-1.5 mb-4">
        {templates.map((t) => (
          <a
            key={t.href}
            href={t.href}
            download
            className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-xs font-medium text-white"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            {t.label}
            <Download className="w-3 h-3 text-white/50 ml-auto" />
          </a>
        ))}
      </div>
    )
  }

  // Force badge
  const renderForceBadge = () => {
    if (!isForced) return null
    if (forceSatisfied) return null
    return (
      <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 bg-amber-400/20 border border-amber-300/30 rounded-lg">
        <span className="text-amber-200 text-[11px] font-medium">
          {s.requireAction === 'brand' ? '👆 Add a brand to continue' : '👆 Add an account to continue'}
        </span>
      </div>
    )
  }

  // Style tag to raise dialogs above tour overlay so modals aren't grayed out
  const tourStyles = (
    <style>{`
      [data-slot="dialog-overlay"] { z-index: 202 !important; }
      [data-slot="dialog-content"] { z-index: 203 !important; }
    `}</style>
  )

  // --- CENTERED MODAL (Welcome + Finish) ---
  if (isCentered) {
    return (
      <>
        {tourStyles}
        <div className="fixed inset-0 z-[200] bg-black/40" style={{ pointerEvents: 'none' }} />

        <div
          className={`fixed z-[201] top-1/2 left-1/2 transition-all duration-300 ease-in-out ${
            fading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          <div className="w-[420px] max-w-[90vw] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden">
            {isLast ? (
              <div className="relative bg-gradient-to-br from-[#005b5b] to-[#008080] text-center">
                <img src="/celebration-1.gif" alt="Celebration" className="w-full object-cover" />
              </div>
            ) : (
              <div className="relative bg-gradient-to-br from-[#005b5b] to-[#008080] px-6 pt-8 pb-10 text-center">
                <button
                  onClick={skip}
                  className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
                <img src="/logo-tour.png" alt="REPCOMMISH" className="h-24 object-contain mb-4 mx-auto" />
                <h2 className="text-xl font-bold text-white mb-1">
                  {s.title}
                </h2>
              </div>
            )}

            <div className="px-6 pt-5 pb-6">
              {!skipConfirm && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed text-center mb-6 whitespace-pre-line">
                  {s.body}
                </p>
              )}

              <div className="flex items-center gap-2 mb-6 px-4">
                <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#005b5b] rounded-full transition-all duration-300"
                    style={{ width: `${((step + 1) / steps.length) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                  {step + 1}/{steps.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {isFirst && !skipConfirm && (
                  <>
                    <Button
                      onClick={() => goTo(step + 1)}
                      className="w-full bg-[#005b5b] hover:bg-[#004848] text-white h-10 text-sm font-medium gap-2"
                    >
                      Let's Go <ArrowRight className="w-4 h-4" />
                    </Button>
                    <button
                      onClick={() => setSkipConfirm(true)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1"
                    >
                      Skip tour
                    </button>
                  </>
                )}
                {isFirst && skipConfirm && (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      Are you sure? We put a lot of effort into this tour... like, at least 20 minutes.
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
                      No worries — you can always restart it from the <HelpCircle className="w-3.5 h-3.5 inline-block align-text-bottom text-[#005b5b]" /> at the top of your screen.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSkipConfirm(false)}
                        className="flex-1 h-9 text-xs"
                      >
                        Fine, I'll stay
                      </Button>
                      <Button
                        onClick={skip}
                        className="flex-1 h-9 text-xs bg-zinc-500 hover:bg-zinc-600 text-white"
                      >
                        Skip anyway
                      </Button>
                    </div>
                  </div>
                )}
                {isLast && (
                  <Button
                    onClick={finish}
                    className="w-full bg-[#005b5b] hover:bg-[#004848] text-white h-10 text-sm font-medium gap-2"
                  >
                    Get Started <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>

            </div>
          </div>
        </div>
      </>
    )
  }

  // --- TOOLTIP STEP (spotlight + positioned card) ---
  const nextDisabled = isForced && !forceSatisfied

  return (
    <>
      {tourStyles}
      <div className="fixed inset-0 z-[200] transition-opacity duration-300" style={{ pointerEvents: 'none' }}>
        {rect ? (
          <div
            className={`absolute transition-all duration-500 ease-in-out ${fading ? 'opacity-0' : 'opacity-100'}`}
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              borderRadius: 12,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
              border: '2px solid rgba(0, 91, 91, 0.5)',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/40" />
        )}
      </div>

      <div
        ref={tipRef}
        className={`fixed z-[201] transition-all duration-300 ease-in-out ${
          fading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        style={{ ...tipStyle, maxWidth: TIP_W }}
      >
        <div className="bg-[#005b5b] rounded-xl shadow-2xl overflow-hidden w-[340px]">
          {/* Arrow */}
          {arrowSide && (
            <div
              className="absolute w-3 h-3 bg-[#005b5b] rotate-45"
              style={{
                ...(arrowSide === 'left' && {
                  left: -6,
                  top: '50%',
                  marginTop: -6,
                }),
                ...(arrowSide === 'right' && {
                  right: -6,
                  top: '50%',
                  marginTop: -6,
                }),
                ...(arrowSide === 'top' && {
                  top: -6,
                  left: arrowOffset != null ? arrowOffset - 6 : '50%',
                  ...(arrowOffset == null && { marginLeft: -6 }),
                }),
                ...(arrowSide === 'bottom' && {
                  bottom: -6,
                  left: arrowOffset != null ? arrowOffset - 6 : '50%',
                  ...(arrowOffset == null && { marginLeft: -6 }),
                }),
              }}
            />
          )}

          <div className="p-4">
            <div className="mb-1.5">
              <h3 className="font-bold text-sm text-white">
                {s.title}
              </h3>
            </div>

            {!skipConfirm && (
              <p className="text-xs text-white/75 leading-relaxed mb-4 whitespace-pre-line">
                {s.body}
              </p>
            )}

            {/* Force badge */}
            {renderForceBadge()}

            {/* Template downloads */}
            {renderTemplates()}

            {/* Progress bar + navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 mr-3">
                <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-300"
                    style={{ width: `${((step + 1) / steps.length) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/50 font-medium whitespace-nowrap">
                  {step + 1}/{steps.length}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {step > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => goTo(step - 1)}
                    className="h-7 w-7 p-0 text-white/50 hover:text-white hover:bg-white/10"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </Button>
                )}
                {!s.navigateToBrand && (
                  <Button
                    size="sm"
                    onClick={() => goTo(step + 1)}
                    disabled={nextDisabled}
                    className={`gap-1 text-xs h-7 px-3 ${
                      nextDisabled
                        ? 'bg-white/20 text-white/40 cursor-not-allowed hover:bg-white/20'
                        : 'bg-white text-[#005b5b] hover:bg-white/90 font-semibold'
                    }`}
                  >
                    Next <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            {/* Skip tour link */}
            <div className="pt-3 border-t border-white/15 mt-3">
              {!skipConfirm ? (
                <button
                  onClick={() => setSkipConfirm(true)}
                  className="w-full text-[11px] text-white/40 hover:text-white/70 transition-colors py-1"
                >
                  Skip tour
                </button>
              ) : (
                <div className="text-center space-y-2 py-1">
                  <p className="text-xs text-white/70">
                    Are you sure? We put a lot of effort into this tour... like, at least 20 minutes.
                  </p>
                  <p className="text-[11px] text-white/50">
                    No worries — you can always restart it from the <HelpCircle className="w-3 h-3 inline-block align-text-bottom text-white/70" /> at the top of your screen.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSkipConfirm(false)}
                      className="flex-1 h-7 text-xs font-medium rounded-md border border-white/30 text-white hover:bg-white/10 transition-colors"
                    >
                      Fine, I'll stay
                    </button>
                    <Button
                      size="sm"
                      onClick={skip}
                      className="flex-1 h-7 text-xs bg-white/20 hover:bg-white/30 text-white"
                    >
                      Skip anyway
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
