// Recipient entry as chips with typeahead over the account directory, so you
// pick a shop's buyer instead of remembering their address.
//
// Commit keys: Enter, Tab, comma, semicolon. Backspace on an empty input pops
// the last chip. Pasting a list of addresses splits it into chips.

import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

const SPLIT = /[,;]\s*/

const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export default function RecipientField({ label, value = [], onChange, directory = [], autoFocus, bare = false }) {
  const [input, setInput] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q) return []
    const chosen = new Set(value.map((v) => v.toLowerCase()))
    return directory
      .filter((d) => d.email && !chosen.has(d.email.toLowerCase()))
      .filter((d) =>
        d.email.toLowerCase().includes(q) ||
        (d.name || '').toLowerCase().includes(q) ||
        (d.accountName || '').toLowerCase().includes(q)
      )
      .slice(0, 6)
  }, [input, directory, value])

  const add = (email) => {
    const clean = String(email || '').trim().replace(/^[<]|[>]$/g, '')
    if (!clean) return
    if (!value.some((v) => v.toLowerCase() === clean.toLowerCase())) {
      onChange([...value, clean])
    }
    setInput('')
    setHighlight(0)
  }

  const commitInput = () => {
    const parts = input.split(SPLIT).map((p) => p.trim()).filter(Boolean)
    parts.forEach(add)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
      return
    }
    if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ';') {
      if (!input.trim()) return
      e.preventDefault()
      if (suggestions[highlight]) add(suggestions[highlight].email)
      else commitInput()
      return
    }
    if (e.key === 'Backspace' && !input && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  if (bare) {
    return (
      <div className="relative flex items-start gap-3 border-b px-4 py-2" onClick={() => inputRef.current?.focus()}>
        <span className="text-sm text-muted-foreground w-10 shrink-0 pt-1">{label}</span>
        <div className="flex-1 min-w-0 flex flex-wrap gap-1.5 items-center cursor-text">
          {value.map((email) => (
            <span
              key={email}
              className={`inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-xs ${
                looksLikeEmail(email)
                  ? 'bg-[#005b5b]/10 text-[#005b5b] dark:bg-[#005b5b]/25 dark:text-[#00b3b3]'
                  : 'bg-destructive/10 text-destructive'
              }`}
              title={looksLikeEmail(email) ? email : `${email} doesn't look like an email address`}
            >
              {email}
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(value.filter((v) => v !== email)) }} className="hover:opacity-70">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={input}
            autoFocus={autoFocus}
            onChange={(e) => { setInput(e.target.value); setHighlight(0) }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => { setTimeout(() => setFocused(false), 120); commitInput() }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (SPLIT.test(text)) {
                e.preventDefault()
                text.split(SPLIT).map((t) => t.trim()).filter(Boolean).forEach(add)
              }
            }}
            className="flex-1 min-w-[140px] bg-transparent text-sm outline-none py-1"
          />
        </div>
        {focused && suggestions.length > 0 && (
          <div className="absolute left-12 right-4 top-full z-50 rounded-md border bg-popover shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={`${s.email}-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { add(s.email); inputRef.current?.focus() }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2 text-sm ${i === highlight ? 'bg-[#005b5b]/10' : ''}`}
              >
                <div className="font-medium truncate">{s.name || s.email}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {s.email}{s.accountName ? ` · ${s.accountName}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {label && <span className="text-xs font-medium">{label}</span>}
      <div
        className="relative rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-[#005b5b]/30 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex flex-wrap gap-1.5 items-center">
          {value.map((email) => (
            <span
              key={email}
              className={`inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-xs ${
                looksLikeEmail(email)
                  ? 'bg-[#005b5b]/10 text-[#005b5b] dark:bg-[#005b5b]/25 dark:text-[#00b3b3]'
                  : 'bg-destructive/10 text-destructive'
              }`}
              title={looksLikeEmail(email) ? email : `${email} doesn't look like an email address`}
            >
              {email}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(value.filter((v) => v !== email)) }}
                className="hover:opacity-70"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={input}
            autoFocus={autoFocus}
            onChange={(e) => { setInput(e.target.value); setHighlight(0) }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            // Delay so a click on a suggestion lands before the list unmounts.
            onBlur={() => { setTimeout(() => setFocused(false), 120); commitInput() }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (SPLIT.test(text)) {
                e.preventDefault()
                text.split(SPLIT).map((p) => p.trim()).filter(Boolean).forEach(add)
              }
            }}
            placeholder={value.length ? '' : 'Type a name, shop, or email…'
            }
            className="flex-1 min-w-[160px] bg-transparent text-sm outline-none py-0.5"
          />
        </div>

        {focused && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={`${s.email}-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { add(s.email); inputRef.current?.focus() }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2 text-sm ${i === highlight ? 'bg-[#005b5b]/10' : ''}`}
              >
                <div className="font-medium truncate">{s.name || s.email}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {s.email}{s.accountName ? ` · ${s.accountName}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
