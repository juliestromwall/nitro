// SICAdex score chip: colored by risk band with a rise/fall arrow vs last year.
// Shared so the Accounts page and the Collections worklist render it identically.
import { TrendingUp, TrendingDown } from 'lucide-react'
import { sicaRisk, scoreRose } from '@/lib/sica'

export default function SicaScoreChip({ retailer, size = 'sm' }) {
  if (!retailer || retailer.sicadex_cm == null) return <span className="text-muted-foreground">—</span>
  const rk = sicaRisk(retailer.sicadex_cm)
  const rose = scoreRose(retailer.sicadex_variance_smly)
  const v = retailer.sicadex_variance_smly
  const pad = size === 'lg' ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5'
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full tabular-nums ${pad}`}
      style={{ background: rk.bg, color: rk.fg, border: `1px solid ${rk.border}` }}
      title={`${rk.tier} — SICAdex ${retailer.sicadex_cm} (higher = worse)`}
    >
      {retailer.sicadex_cm}
      {v != null && v !== 0 && (
        rose
          ? <TrendingUp className="size-3 text-[#b91c1c]" />
          : <TrendingDown className="size-3 text-[#16a34a]" />
      )}
    </span>
  )
}
