-- Per-user Google OAuth tokens for the Gmail integration.
--
-- Users connect their own @foundrydist.com Workspace account (the consent
-- screen is an Internal app, so no Google verification / CASA assessment is
-- needed for the restricted gmail scopes). One row per user.
--
-- SECURITY: no RLS policies are defined on purpose. RLS is enabled and nothing
-- matches, so PostgREST denies every request from the browser — access tokens
-- and refresh tokens are only ever read by the edge functions via the service
-- role. The client never receives a Google token; it asks an edge function to
-- act on its behalf instead.

create table if not exists public.google_tokens (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  google_email     text,
  access_token     text not null,
  refresh_token    text not null,
  token_expires_at timestamptz not null,
  scopes           text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

-- Belt and braces: revoke the grants PostgREST's roles get by default so a
-- future permissive policy can't accidentally expose tokens.
revoke all on public.google_tokens from anon, authenticated;

comment on table public.google_tokens is
  'Google OAuth tokens per user. Service-role access only — never expose to the browser.';
