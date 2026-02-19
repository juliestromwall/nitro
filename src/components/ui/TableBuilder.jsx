import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'

function TableBuilder({ columns, rows, onChange, minRows = 1 }) {
  const tableRef = useRef(null)
  const [focused, setFocused] = useState(null) // { row, col }

  // Initialize with minRows blank rows if empty
  useEffect(() => {
    if (rows.length === 0 && minRows > 0) {
      const blank = Array.from({ length: minRows }, () =>
        Object.fromEntries(columns.map((c) => [c.key, '']))
      )
      onChange(blank)
    }
  }, []) // only on mount

  const updateCell = (rowIdx, key, value) => {
    const updated = rows.map((r, i) =>
      i === rowIdx ? { ...r, [key]: value } : r
    )
    onChange(updated)
  }

  const addRow = () => {
    const blank = Object.fromEntries(columns.map((c) => [c.key, '']))
    onChange([...rows, blank])
    setTimeout(() => {
      setFocused({ row: rows.length, col: 0 })
    }, 0)
  }

  const deleteRow = (rowIdx) => {
    if (rows.length <= 1) return
    const updated = rows.filter((_, i) => i !== rowIdx)
    onChange(updated)
  }

  // Focus management
  useEffect(() => {
    if (!focused || !tableRef.current) return
    const input = tableRef.current.querySelector(
      `[data-row="${focused.row}"][data-col="${focused.col}"]`
    )
    if (input) input.focus()
  }, [focused])

  // Auto-focus first cell on mount
  useEffect(() => {
    setTimeout(() => {
      setFocused({ row: 0, col: 0 })
    }, 100)
  }, [])

  const handleKeyDown = useCallback((e, rowIdx, colIdx) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      if (colIdx < columns.length - 1) {
        e.preventDefault()
        setFocused({ row: rowIdx, col: colIdx + 1 })
      } else if (rowIdx < rows.length - 1) {
        e.preventDefault()
        setFocused({ row: rowIdx + 1, col: 0 })
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      if (colIdx > 0) {
        e.preventDefault()
        setFocused({ row: rowIdx, col: colIdx - 1 })
      } else if (rowIdx > 0) {
        e.preventDefault()
        setFocused({ row: rowIdx - 1, col: columns.length - 1 })
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rowIdx < rows.length - 1) {
        setFocused({ row: rowIdx + 1, col: colIdx })
      } else {
        addRow()
      }
    }
  }, [columns.length, rows.length])

  // Handle paste: if pasted text has multiple lines, expand into rows
  const handlePaste = useCallback((e, rowIdx, colIdx) => {
    const pasted = e.clipboardData.getData('text')
    if (!pasted) return

    // Check if paste contains tabs (spreadsheet row with multiple columns)
    const hasMultipleLines = pasted.includes('\n')
    const hasTabs = pasted.includes('\t')

    if (!hasMultipleLines && !hasTabs) return // single value, let default behavior handle it

    e.preventDefault()

    const lines = pasted.split('\n').map((l) => l.trimEnd()).filter((l) => l)
    if (lines.length === 0) return

    const updated = [...rows]
    const colKey = columns[colIdx].key

    lines.forEach((line, i) => {
      const targetRow = rowIdx + i
      const cells = hasTabs ? line.split('\t') : [line]

      // Ensure row exists
      while (updated.length <= targetRow) {
        updated.push(Object.fromEntries(columns.map((c) => [c.key, ''])))
      }

      // Fill cells starting from the pasted column
      cells.forEach((cellValue, j) => {
        const targetCol = colIdx + j
        if (targetCol < columns.length) {
          const col = columns[targetCol]
          let val = cellValue.trim()
          if (col.type === 'number') {
            val = val.replace(/[^0-9.]/g, '')
          }
          updated[targetRow] = { ...updated[targetRow], [col.key]: val }
        }
      })
    })

    onChange(updated)

    // Focus last pasted cell
    setTimeout(() => {
      setFocused({ row: Math.min(rowIdx + lines.length - 1, updated.length - 1), col: colIdx })
    }, 0)
  }, [rows, columns, onChange])

  return (
    <div className="space-y-2">
      <div className="border rounded-lg overflow-x-auto" ref={tableRef}>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800 border-b">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap"
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                >
                  {col.label}
                  {col.required && <span className="text-red-500 ml-0.5">*</span>}
                </th>
              ))}
              <th className="w-8 py-1.5 px-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b last:border-0 group">
                {columns.map((col, colIdx) => (
                  <td key={col.key} className="py-0.5 px-0.5" style={col.minWidth ? { minWidth: col.minWidth } : undefined}>
                    {col.type === 'select' ? (
                      <select
                        data-row={rowIdx}
                        data-col={colIdx}
                        value={row[col.key] || ''}
                        onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                        className={`w-full h-8 text-xs bg-transparent border rounded px-1.5 outline-none focus:ring-1 focus:ring-[#005b5b] ${
                          col.required && !row[col.key] ? 'border-red-300' : 'border-zinc-200 dark:border-zinc-700'
                        }`}
                      >
                        <option value="">{col.placeholder || 'Select...'}</option>
                        {(col.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        data-row={rowIdx}
                        data-col={colIdx}
                        type="text"
                        inputMode={col.type === 'number' ? 'decimal' : 'text'}
                        value={row[col.key] || ''}
                        placeholder={col.placeholder || ''}
                        onChange={(e) => {
                          let val = e.target.value
                          if (col.type === 'number') {
                            val = val.replace(/[^0-9.]/g, '')
                          }
                          updateCell(rowIdx, col.key, val)
                        }}
                        onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                        onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                        className={`w-full h-8 text-xs bg-transparent border rounded px-2 outline-none focus:ring-1 focus:ring-[#005b5b] placeholder:text-zinc-300 dark:placeholder:text-zinc-600 ${
                          col.required && !row[col.key] ? 'border-red-300' : 'border-zinc-200 dark:border-zinc-700'
                        }`}
                      />
                    )}
                  </td>
                ))}
                <td className="py-0.5 px-0.5">
                  <button
                    type="button"
                    onClick={() => deleteRow(rowIdx)}
                    disabled={rows.length <= 1}
                    className="p-1 text-zinc-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
                    tabIndex={-1}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 text-xs text-[#005b5b] hover:text-[#007a7a] font-medium transition-colors"
        >
          <Plus className="size-3.5" />
          Add Row
        </button>
        <span className="text-[10px] text-muted-foreground">Tip: Paste a column from your spreadsheet to auto-fill rows</span>
      </div>
    </div>
  )
}

export default TableBuilder
