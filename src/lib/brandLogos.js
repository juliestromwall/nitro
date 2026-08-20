// Brand wordmark logos, shown in place of text badges.
//
// Brand names vary across the data sources (accounting's portal calls Autumn
// "Autumn/Corduroy", the rep app just "Autumn"), so match on a normalised
// substring rather than exact equality.
import nitro from '@/assets/brands/nitro.png'
import autumn from '@/assets/brands/autumn.png'
import l1 from '@/assets/brands/l1.png'
import eivy from '@/assets/brands/eivy.png'

const LOGOS = [
  { key: 'nitro', test: /nitro/i, src: nitro, alt: 'Nitro' },
  { key: 'autumn', test: /autumn|corduroy/i, src: autumn, alt: 'Autumn' },
  { key: 'l1', test: /\bl1\b/i, src: l1, alt: 'L1' },
  { key: 'eivy', test: /eivy/i, src: eivy, alt: 'Eivy' },
]

// Returns { src, alt } for a brand name, or null when there's no logo for it —
// callers fall back to the name so an unknown brand never renders blank.
export function brandLogo(name) {
  if (!name) return null
  const hit = LOGOS.find((l) => l.test.test(String(name)))
  return hit ? { src: hit.src, alt: hit.alt } : null
}

export default LOGOS
