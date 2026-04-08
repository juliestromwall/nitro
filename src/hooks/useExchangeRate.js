import { useState, useEffect } from 'react'

// Module-level cache: key → { rate, timestamp }
const rateCache = new Map()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export function useExchangeRate(from, to) {
  const [rate, setRate] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!from || !to || from === to) {
      setRate(1)
      setLoading(false)
      return
    }

    const key = `${from}-${to}`
    const cached = rateCache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setRate(cached.rate)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const r = data.rates?.[to]
        if (r) {
          rateCache.set(key, { rate: r, timestamp: Date.now() })
          setRate(r)
        }
      })
      .catch(() => {
        // On error, keep rate at 1 (no conversion)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [from, to])

  return { rate, loading }
}

// Hook for multiple currency pairs — takes array of { from, to } objects
// Returns a Map of "FROM-TO" → rate
export function useExchangeRates(pairs) {
  const [rates, setRates] = useState(new Map())
  const [loading, setLoading] = useState(false)

  // Dedupe pairs, skip same-currency
  const uniqueKey = pairs
    .filter((p) => p.from && p.to && p.from !== p.to)
    .map((p) => `${p.from}-${p.to}`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
    .join(',')

  useEffect(() => {
    if (!uniqueKey) {
      setRates(new Map())
      setLoading(false)
      return
    }

    const toFetch = []
    const result = new Map()
    for (const key of uniqueKey.split(',')) {
      const cached = rateCache.get(key)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        result.set(key, cached.rate)
      } else {
        toFetch.push(key)
      }
    }

    if (toFetch.length === 0) {
      setRates(result)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    Promise.all(
      toFetch.map((key) => {
        const [from, to] = key.split('-')
        return fetch(`https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`)
          .then((res) => res.json())
          .then((data) => {
            const r = data.rates?.[to]
            if (r) {
              rateCache.set(key, { rate: r, timestamp: Date.now() })
              result.set(key, r)
            }
          })
          .catch(() => {})
      })
    ).finally(() => {
      if (!cancelled) {
        setRates(new Map(result))
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [uniqueKey])

  // Helper: get rate for a pair, default 1
  const getRate = (from, to) => {
    if (!from || !to || from === to) return 1
    return rates.get(`${from}-${to}`) || 1
  }

  return { rates, getRate, loading }
}
