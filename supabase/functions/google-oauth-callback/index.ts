// Google OAuth redirect target. Exchanges the authorization code for tokens,
// stores them, and bounces the browser back into the app.
//
// This one runs WITHOUT a Supabase JWT — Google performs the redirect, not the
// app — so it must be deployed with --no-verify-jwt. It never trusts the
// browser for anything beyond the opaque `state` it issued itself, and it only
// ever writes a row for the user id carried in that state.

import {
  admin, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI,
} from '../_shared/googleOAuth.ts'

// Where the app lives. Set APP_URL as a secret (e.g. https://app.repcommish.com).
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.repcommish.com'
// Extra origins allowed to receive the post-auth redirect, comma separated.
const EXTRA_ORIGINS = (Deno.env.get('ALLOWED_REDIRECT_ORIGINS') ?? '')
  .split(',').map((o) => o.trim()).filter(Boolean)

const DEFAULT_TARGET = `${APP_URL}/app/accounting`

/**
 * `redirect_to` arrives inside the OAuth state, which the browser handed us —
 * so it is attacker-controllable. Redirecting to it unchecked would make this
 * endpoint an open redirect. Only bounce back to the app's own origin (or a
 * dev server on loopback); anything else falls back to the default page.
 */
function safeTarget(redirectTo: string): string {
  if (!redirectTo) return DEFAULT_TARGET
  let url: URL
  try { url = new URL(redirectTo) } catch { return DEFAULT_TARGET }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_TARGET

  const allowed = new Set([new URL(APP_URL).origin, ...EXTRA_ORIGINS])
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (allowed.has(url.origin) || isLoopback) return url.toString()
  return DEFAULT_TARGET
}

const back = (params: Record<string, string>, redirectTo: string) => {
  const target = new URL(safeTarget(redirectTo))
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
  return Response.redirect(target.toString(), 302)
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const denied = url.searchParams.get('error')

  let state: { user_id?: string; redirect_to?: string } = {}
  try { state = JSON.parse(atob(stateRaw || '')) } catch { /* handled below */ }
  const returnTo = state.redirect_to || DEFAULT_TARGET

  if (denied) return back({ google: 'denied' }, returnTo)
  if (!code || !state.user_id) return back({ google: 'error' }, returnTo)

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    })
    const tokens = await tokenRes.json()

    if (!tokenRes.ok || !tokens.access_token) {
      console.error('Token exchange failed:', tokens)
      return back({ google: 'error' }, returnTo)
    }

    // Without a refresh token the connection dies in an hour and can't be
    // renewed — treat it as a failed connect rather than storing a dud.
    if (!tokens.refresh_token) {
      console.error('No refresh_token returned; not storing partial credentials.')
      return back({ google: 'no_refresh_token' }, returnTo)
    }

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const info = await infoRes.json().catch(() => ({}))

    const db = admin()
    // Replace rather than upsert so a reconnect never leaves a stale refresh
    // token behind.
    await db.from('google_tokens').delete().eq('user_id', state.user_id)
    const { error } = await db.from('google_tokens').insert({
      user_id: state.user_id,
      google_email: info.email ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope ?? '',
      updated_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Storing google tokens failed:', error)
      return back({ google: 'error' }, returnTo)
    }

    return back({ google: 'connected' }, returnTo)
  } catch (err) {
    console.error('OAuth callback error:', err)
    return back({ google: 'error' }, returnTo)
  }
})
