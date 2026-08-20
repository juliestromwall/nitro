# Gmail integration — setup

Per-user Gmail OAuth: each person connects their own `@foundrydist.com`
Workspace account, and RepCommish sends mail as them so replies come back to
their own inbox.

## Two phases: test External, ship Internal

The end state is an **Internal** app restricted to `@foundrydist.com`. But an
Internal app *only* accepts accounts inside its own Workspace domain, so it
can't be used to test from an outside address.

So:

| Phase | Consent screen | Who can connect | Review needed |
|-------|----------------|-----------------|---------------|
| Testing now | **External**, publishing status **Testing** | up to 100 named test users (e.g. `hello@juliestromwall.com`) | none |
| Live for Foundry | **Internal** | any `@foundrydist.com` Workspace account | none |

Flipping External → Internal later is a single setting on the consent screen.
The client ID, client secret, redirect URI and scopes all carry over — nothing
in this repo changes.

**Check this before creating the client:** "Internal" is only offered when the
Google Cloud project belongs to the `foundrydist.com` Workspace organisation. If
the project sits under a personal Google account, the option is greyed out and
moving the project between organisations afterwards is painful. Create it in
the Foundry org from the start.

**While in External/Testing**, Google expires refresh tokens after **7 days**,
so testers reconnect about weekly. That limit disappears once the app is
Internal.

## Why the end state is an "Internal" OAuth app

`gmail.readonly` / `gmail.modify` are **restricted scopes**. An *External* app
using them needs Google verification plus a CASA security assessment (the same
blocker that stalled external sending before). An **Internal** app — one that
only accepts users inside the `foundrydist.com` Workspace — skips verification
entirely and can use restricted scopes immediately.

Consequence: only `@foundrydist.com` accounts can connect. Personal Gmail
accounts will be refused at the consent screen. That's the trade that makes
this shippable today.

## 1. Google Cloud Console

1. Pick (or create) the project that owns the Workspace integration.
2. **APIs & Services → Library** → enable **Gmail API**.
3. **APIs & Services → OAuth consent screen**
   - User type: **External**, left in **Testing** for now (switch to
     **Internal** when rolling out to Foundry staff — see above)
   - Under **Test users**, add every address that will test, e.g.
     `hello@juliestromwall.com`
   - App name, support email, developer contact
   - Scopes — add:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/userinfo.email`
4. **Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - Authorized redirect URI (exact, no trailing slash):
     ```
     https://<your-project-ref>.supabase.co/functions/v1/google-oauth-callback
     ```
   - Save the **Client ID** and **Client secret**.

> `gmail.readonly` / `gmail.modify` aren't used by the compose-and-send feature
> yet — they're requested now so the inbox work doesn't force everyone to
> re-consent later. Drop them from `GOOGLE_SCOPES` in
> `supabase/functions/_shared/googleOAuth.ts` if you'd rather grant send-only.

## 2. Supabase secrets

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID="…apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="…" \
  APP_URL="https://app.repcommish.com"
```

`APP_URL` is where the callback returns the browser when it has no explicit
return path. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the
platform.

## 3. Migration + deploy

Testing happens against the **STAGING** project (`xtqabwojbysgragmfbgn`) so live
data is never involved. Its redirect URI is:

```
https://xtqabwojbysgragmfbgn.supabase.co/functions/v1/google-oauth-callback
```

Register **both** that and the production URI on the same OAuth client — Google
allows a list, and it saves creating a second client later.

```bash
REF=xtqabwojbysgragmfbgn                             # or the production ref
supabase db push --project-ref $REF                  # creates public.google_tokens
supabase functions deploy google-oauth              --project-ref $REF
supabase functions deploy gmail-send                --project-ref $REF
supabase functions deploy google-oauth-callback --no-verify-jwt --project-ref $REF
```

Run the app against staging with `npm run dev:staging`.

`--no-verify-jwt` on the callback is required and safe: **Google** performs that
redirect, not the app, so there's no Supabase JWT to present. The function
trusts nothing but the opaque `state` it issued itself, and writes a row only
for the user id carried in that state.

## Security notes

- `public.google_tokens` has RLS **enabled with no policies**, and grants
  revoked from `anon`/`authenticated`. Only the service role reads it.
- The browser never receives a Google access token. It asks `gmail-send` to
  send on its behalf. (abc-surrogacy hands the token to the browser and calls
  Gmail client-side; proxying costs nothing at this scope and means an XSS
  can't walk off with a `gmail.modify` token.)
- Attachments are capped at 10 MB total per email. They get base64-encoded
  twice on the way to Gmail (into the JSON request, then again as the MIME
  `raw` field), so 10 MB of files is roughly 18 MB on the wire — comfortably
  inside Gmail's 25 MB message limit.
- Disconnect revokes the token with Google, then deletes the row.
- A refresh that comes back `invalid_grant` (user revoked access, or the token
  aged out) deletes the row so the UI can prompt a clean reconnect.

## Using it

- **Accounting → Dashboard** has the Gmail card: Connect / Disconnect, and the
  address you'll send as.
- **New Email** on the Dashboard opens a blank compose.
- On an account page, **Email** in the header strip mails every contact on the
  account; the mail icon on a contact card mails just that person.
- No tag and no account selection are required to send — a recipient is the
  only thing that gates the Send button.
