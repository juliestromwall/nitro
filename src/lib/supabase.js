import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The Supabase storage key where the auth session lives in localStorage
const PROJECT_REF = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1] || ''
export const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
