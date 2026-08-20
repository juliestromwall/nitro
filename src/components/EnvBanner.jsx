// Loud banner on anything that is not the real production site.
//
// The trap this exists for: `npm run dev` reads .env, which points at the
// PRODUCTION Supabase project. So a local server looks like a safe sandbox
// while writing straight into live data — and conversely, work done on
// staging never shows up in production and looks "lost". Naming the database
// is therefore the important half; naming the server alone would still leave
// you guessing.
const PROD_HOSTS = new Set(['app.repcommish.com'])

// Project ref out of https://<ref>.supabase.co
const projectRef = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  } catch {
    return 'unknown'
  }
})()

const PROD_REF = 'mybzeehqbecuzjgmxpvn'

export default function EnvBanner() {
  const host = typeof window === 'undefined' ? '' : window.location.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')
  const isProdHost = PROD_HOSTS.has(host)

  // Real production site on the real database: say nothing.
  if (isProdHost && projectRef === PROD_REF) return null

  const onProdData = projectRef === PROD_REF
  const where = isLocal ? 'LOCAL DEV SERVER' : isProdHost ? 'PRODUCTION SITE' : `NON-PRODUCTION (${host})`

  return (
    <div
      className={`w-full text-white font-extrabold tracking-wide text-center px-4 py-3 border-b-4 ${
        onProdData
          ? 'bg-red-600 border-red-800'   // worst case: sandbox server, live data
          : 'bg-amber-500 border-amber-700'
      }`}
      style={{ letterSpacing: '0.04em' }}
    >
      <div className="text-base sm:text-lg leading-tight">
        ⚠️ {where} — NOT app.repcommish.com
      </div>
      <div className="text-xs sm:text-sm font-semibold mt-0.5 opacity-95">
        {onProdData
          ? `Connected to the LIVE production database (${projectRef}). Anything you change here is REAL.`
          : `Connected to ${projectRef} — this is NOT production data, and nothing saved here will appear on the live site.`}
      </div>
    </div>
  )
}
