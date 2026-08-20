// Frontend helpers for the per-user Gmail integration.
//
// Every call goes through a Supabase edge function; the browser never holds a
// Google access token. See supabase/functions/{google-oauth,gmail-send}.

import { supabase } from '@/lib/supabase'

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function call(fn, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body || {}),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `${fn} failed`)
    // 'connect' / 'reconnect' — lets the UI show the right call to action.
    err.actionRequired = data.action_required || null
    throw err
  }
  return data
}

/** { connected, google_email?, scopes? } */
export const getGoogleStatus = () => call('google-oauth', { action: 'status' })

/** Sends the browser to Google's consent screen; returns after redirecting. */
export async function connectGoogle(returnTo) {
  const { url } = await call('google-oauth', {
    action: 'auth-url',
    redirect_to: returnTo || window.location.href.split('?')[0],
  })
  window.location.href = url
}

export const disconnectGoogle = () => call('google-oauth', { action: 'disconnect' })

/** The identity Gmail will send as, plus the account's signature HTML. */
export const getSendAs = () => call('gmail-send', { action: 'sendas' })

/**
 * Send a message as the connected account.
 * `attachments`: [{ filename, mimeType, base64Data }]
 */
export const sendEmail = ({ to, subject, body, cc, bcc, attachments = [], includeSignature = true }) =>
  call('gmail-send', {
    action: 'send',
    to, subject, body, cc, bcc,
    attachments,
    include_signature: includeSignature,
  })

/** Read a File into the base64 shape the send endpoint expects. */
export function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data: result.slice(result.indexOf(',') + 1),
      })
    }
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/** Plain-text compose box -> the HTML body Gmail sends. */
export function textToHtml(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
