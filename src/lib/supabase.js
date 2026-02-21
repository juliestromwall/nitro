import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The Supabase storage key where the auth session lives in localStorage
const PROJECT_REF = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1] || ''
export const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`

// Custom fetch with AbortController — properly kills hung requests.
// After a tab switch, the TCP connection to Supabase may be dead.
// Promise.race can't close dead connections (the hung fetch keeps running,
// blocking the HTTP/2 connection for ALL subsequent requests to that origin).
// AbortController sends RST, forcing the browser to create a fresh connection.
function createAbortableFetch(defaultMs = 15000) {
  return (url, options = {}) => {
    // Don't double-wrap if caller already set an abort signal
    if (options.signal) return fetch(url, options)

    // Longer timeout for storage uploads
    const isUpload = typeof url === 'string' && url.includes('/storage/') && options.method === 'POST'
    const ms = isUpload ? 60000 : defaultMs

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)

    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer))
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: createAbortableFetch(15000),
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Use a simple lock instead of navigator.locks.
    // navigator.locks can deadlock when token refresh fails, causing
    // ALL Supabase calls (including signOut) to hang forever.
    lock: async (name, acquireTimeout, fn) => {
      return await fn()
    },
  },
})

// Nuclear sign-out: clears localStorage directly, bypassing any stuck locks.
// Use this when supabase.auth.signOut() hangs.
export function nukeSession() {
  // Clear Supabase auth
  localStorage.removeItem(AUTH_STORAGE_KEY)
  // Clear app caches
  Object.keys(localStorage)
    .filter((k) => k.startsWith('rc_cache_'))
    .forEach((k) => localStorage.removeItem(k))
}

// Warm the TCP connection to Supabase after a tab switch.
// Dead connections are only detected when you try to use them.
// This lightweight HEAD request forces discovery and replacement of
// dead connections BEFORE the user makes a real request.
export async function warmConnection() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: { 'apikey': supabaseAnonKey },
      signal: controller.signal,
    })
    clearTimeout(timer)
  } catch {
    // Failure is fine — the browser dropped the dead connection.
    // Next real request will use a fresh connection and succeed.
  }
}
