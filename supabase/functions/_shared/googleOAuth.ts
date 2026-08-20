// Shared helpers for the per-user Gmail OAuth integration.
//
// Tokens live in public.google_tokens and are only ever touched with the
// service role. Nothing here returns a token to the browser — callers run
// inside edge functions and use the token to talk to Google directly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
export const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
export const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

// Where Google sends the user back. Must exactly match an "Authorized redirect
// URI" on the OAuth client in Google Cloud Console.
export const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth-callback`

// Read + send + label management, plus the address to show as "from".
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY)

/** Resolve the calling user from their Supabase JWT, or null. */
export async function userFromRequest(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const { data, error } = await admin().auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !data?.user) return null
  return data.user
}

export interface TokenRow {
  user_id: string
  google_email: string | null
  access_token: string
  refresh_token: string
  token_expires_at: string
  scopes: string
}

/**
 * Returns a usable access token for `userId`, refreshing it when it's within
 * five minutes of expiry. Throws 'not_connected' when there's no row, and
 * 'reconnect_required' when Google has revoked the refresh token (in which
 * case the row is deleted so the user gets a clean reconnect).
 */
export async function getAccessToken(userId: string): Promise<{ token: string; email: string | null }> {
  const db = admin()
  const { data: row } = await db
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<TokenRow>()

  if (!row) throw new Error('not_connected')

  const expiresAt = new Date(row.token_expires_at).getTime()
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    return { token: row.access_token, email: row.google_email }
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  })
  const fresh = await res.json()

  if (!res.ok || !fresh.access_token) {
    // invalid_grant = the user revoked access or the token aged out.
    if (fresh.error === 'invalid_grant') {
      await db.from('google_tokens').delete().eq('user_id', userId)
      throw new Error('reconnect_required')
    }
    throw new Error(fresh.error_description || fresh.error || 'token_refresh_failed')
  }

  const newExpiry = new Date(Date.now() + fresh.expires_in * 1000).toISOString()
  await db
    .from('google_tokens')
    .update({
      access_token: fresh.access_token,
      token_expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return { token: fresh.access_token, email: row.google_email }
}

/** Maps the thrown token errors onto a response the UI can act on. */
export function tokenErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'not_connected') {
    return json({ error: 'No Google account connected', action_required: 'connect' }, 400)
  }
  if (message === 'reconnect_required') {
    return json({ error: 'Google access expired', action_required: 'reconnect' }, 401)
  }
  return json({ error: message }, 500)
}
