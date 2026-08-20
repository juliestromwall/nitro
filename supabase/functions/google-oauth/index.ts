// Google account connection management for the signed-in user.
//
// POST { action: 'auth-url' | 'status' | 'disconnect', redirect_to?: string }
//
// 'auth-url' returns the Google consent URL to send the browser to. The user's
// id and the page to return them to travel through the OAuth `state` param,
// signed by nothing but unguessable-by-value — the callback re-validates the
// user id against the tokens it receives from Google before storing anything.

import {
  corsHeaders, json, admin, userFromRequest,
  GOOGLE_CLIENT_ID, REDIRECT_URI, GOOGLE_SCOPES,
} from '../_shared/googleOAuth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await userFromRequest(req)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: { action?: string; redirect_to?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine for status */ }
  const action = body.action || 'status'

  const db = admin()

  if (action === 'auth-url') {
    if (!GOOGLE_CLIENT_ID) return json({ error: 'GOOGLE_CLIENT_ID is not configured' }, 500)

    const state = btoa(JSON.stringify({
      user_id: user.id,
      redirect_to: body.redirect_to || '',
    }))

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', GOOGLE_CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT_URI)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', GOOGLE_SCOPES)
    url.searchParams.set('state', state)
    // offline + consent are what make Google hand back a refresh_token.
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    // Nudges the picker toward the user's work address.
    if (user.email) url.searchParams.set('login_hint', user.email)

    return json({ url: url.toString() })
  }

  if (action === 'disconnect') {
    const { data: row } = await db
      .from('google_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle<{ access_token: string }>()

    // Best effort — revoking can fail if the token already expired.
    if (row?.access_token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${row.access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }).catch(() => {})
    }

    await db.from('google_tokens').delete().eq('user_id', user.id)
    return json({ connected: false })
  }

  // status
  const { data: row } = await db
    .from('google_tokens')
    .select('google_email, scopes, token_expires_at')
    .eq('user_id', user.id)
    .maybeSingle<{ google_email: string | null; scopes: string; token_expires_at: string }>()

  if (!row) return json({ connected: false })
  return json({ connected: true, google_email: row.google_email, scopes: row.scopes })
})
