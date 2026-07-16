// Store for WSR ACH payment remittance forms. Each upload is one remittance
// (one check / one ACH transaction). Persistence moved from browser-local
// IndexedDB to Supabase (see portalStore.js) so the data is shared across
// logins. Public API unchanged.
//
// Shape per record:
// {
//   id, uploadedAt, fileName,
//   checkDate: 'YYYY-MM-DD',
//   checkNumber: 'ACH06626',
//   paymentAmount: 4908.87,
//   invoices: [
//     { type, invoiceNum, invoiceDate, memberId, invoiceAmount,
//       vendorAdminFee, amountPaid }
//   ]
// }

import { pget, pset, pdel } from './portalStore'

const KEY_RECORDS = 'wsr_remittances'

export async function loadWsrRemittances() {
  try {
    const arr = await pget(KEY_RECORDS)
    if (!Array.isArray(arr)) return []
    // Newest check date first.
    return [...arr].sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''))
  } catch {
    return []
  }
}

// Add a remittance — dedupe by checkNumber so re-uploading the same file
// (or the same ACH ref under a different filename) replaces rather than
// duplicates.
export async function addWsrRemittance(rec) {
  const existing = await loadWsrRemittances()
  const filtered = existing.filter(r => r.checkNumber !== rec.checkNumber)
  filtered.push(rec)
  await pset(KEY_RECORDS, filtered)
  return filtered.sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''))
}

export async function deleteWsrRemittance(id) {
  const existing = await loadWsrRemittances()
  const filtered = existing.filter(r => r.id !== id)
  await pset(KEY_RECORDS, filtered)
  return filtered
}

export async function clearWsrRemittances() {
  try { await pdel(KEY_RECORDS) } catch {}
}
