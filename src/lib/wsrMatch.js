// Maps a WSR remittance "Member ID" to the member's account. When QuickBooks
// renames a WSR-member invoice to bare "WSR" on payment, the remittance still
// carries the Member ID (e.g. "SUNDOWN", "MOUNTCH", "KENJONE"). Those codes are
// concatenated word-PREFIXES of the account name (SUNDOWN → "Sundown Ski…",
// MOUNT+CH → "Mountain Chalet", KEN+JONE → "Ken Jones"). This recovers the
// account straight from the remittance — independent of invoice upload mode
// (Append/Replace) or whether the invoice was ever seen under its member name.
//
// We match ONLY against WSR-tagged accounts and accept ONLY confident matches,
// so an unresolved member is left for a BP override rather than mis-routed.

const normId = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// Member IDs that aren't clean word-prefixes of the account name (owner names,
// consonant abbreviations, or greedy-match collisions). Confirmed via the
// shared invoice's line-item customer name (POWDERHSE confirmed with Tony =
// Powder House Inc - OR). Keyed by normalized member id → exact account name.
const MEMBER_OVERRIDES = {
  KENJONE: 'SNOWBOARD JONES (WSR)',
  SKIHAUS: 'NOTB SNOWBOARDS / SKI HAUS (WSR)',
  POWDERH: 'POWDER HOUND LLC. (WSR)',
  POWDERHSE: 'POWDER HOUSE INC - OR (WSR)',
}
const isWsrAccount = a => /\bwsr\b/i.test(a?.name || '') || /\(wsr\)/i.test(a?.name || '')
const wordsOf = name => String(name || '').toUpperCase()
  .replace(/\(WSR\)/g, ' ').replace(/\bWSR\b/g, ' ')
  .replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)

// Greedily consume the member id as a prefix of each word in order (words may
// be skipped). Returns match quality, or null if the id can't be consumed.
function wordPrefixMatch(mid, name) {
  const M = normId(mid), words = wordsOf(name)
  let k = 0, wordsUsed = 0, firstWordChars = 0
  for (let wi = 0; wi < words.length && k < M.length; wi++) {
    const w = words[wi]
    let j = 0
    while (j < w.length && k < M.length && w[j] === M[k]) { j++; k++ }
    if (j > 0) { wordsUsed++; if (wi === 0) firstWordChars = j }
  }
  return k === M.length ? { wordsUsed, firstWordChars } : null
}

// Returns the best-matching account for `memberId`, or null when there's no
// confident match (missing account, or an ambiguous tie).
export function matchMemberToAccount(memberId, accounts) {
  const M = normId(memberId)
  if (!M) return null
  // Explicit override first (codes that aren't derivable from the name).
  const ov = MEMBER_OVERRIDES[M]
  if (ov) {
    const byName = (accounts || []).find(a => normId(a.name) === normId(ov))
    if (byName) return byName
  }
  const cands = []
  for (const a of accounts || []) {
    if (!isWsrAccount(a)) continue
    const wp = wordPrefixMatch(M, a.name)
    if (wp) cands.push({ a, ...wp })
  }
  if (!cands.length) return null
  if (cands.length === 1) return cands[0].a
  // Prefer the match using the fewest words (tightest), then the most chars off
  // the first word. Only accept when that ordering is unambiguous.
  cands.sort((x, y) => x.wordsUsed - y.wordsUsed || y.firstWordChars - x.firstWordChars)
  const confident = cands[0].wordsUsed !== cands[1].wordsUsed || cands[0].firstWordChars !== cands[1].firstWordChars
  return confident ? cands[0].a : null
}
