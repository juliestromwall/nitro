/**
 * Parse a single CSV line respecting quoted fields.
 * Handles: "value with, commas", "$1,600.34", normal,values
 */
export function parseCSVLine(line) {
  const cols = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        cols.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  cols.push(current.trim())
  return cols
}
