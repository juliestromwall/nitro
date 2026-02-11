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

/**
 * Split CSV text into logical rows, respecting multi-line quoted fields.
 * A newline inside "quotes" is part of the field value, not a row break.
 */
export function splitCSVRows(text) {
  const rows = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '""'
        i++
      } else if (ch === '"') {
        inQuotes = false
        current += ch
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        current += ch
      } else if (ch === '\n') {
        if (current.trim()) rows.push(current)
        current = ''
      } else if (ch === '\r') {
        // skip, handle \n next
      } else {
        current += ch
      }
    }
  }
  if (current.trim()) rows.push(current)
  return rows
}
