// Stat tiles for the accounting pages, matching the rep-side dashboard's
// dark-slab-plus-coloured-icon-chip language (see pages/Dashboard.jsx).
//
// Two weights, so a screen can say which number matters:
//   StatTile — dark hero slab. Use for the two or three numbers that drive a
//              decision (open balance, overdue count).
//   MiniStat — quiet bordered card. Use for supporting context.

const TONES = {
  teal:    'bg-[#005b5b]',
  emerald: 'bg-emerald-600',
  amber:   'bg-amber-500',
  red:     'bg-red-600',
  zinc:    'bg-zinc-600',
}

export function StatTile({ icon: Icon, label, value, hint, tone = 'teal', onClick }) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`flex items-center gap-3 bg-zinc-900 dark:bg-zinc-900 rounded-xl px-5 py-4 text-left w-full
        shadow-lg shadow-zinc-900/20 ring-1 ring-white/5
        ${onClick ? 'transition-transform hover:-translate-y-0.5 hover:shadow-xl' : ''}`}
    >
      <div className={`p-2 rounded-lg shrink-0 ${TONES[tone] || TONES.teal}`}>
        {Icon && <Icon className="size-5 text-white" />}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-400 uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl font-bold text-white tabular-nums truncate">{value}</p>
        {hint && <p className="text-[11px] text-zinc-500 truncate">{hint}</p>}
      </div>
    </Wrapper>
  )
}

export function MiniStat({ label, value, hint, accent }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${accent || ''}`}>{value}</p>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  )
}
