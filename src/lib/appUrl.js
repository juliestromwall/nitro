// Marketing-site links point to app.repcommish.com in production so visitors
// land on the right subdomain. On localhost we use relative paths so clicking
// Log In / Sign Up stays inside the dev server instead of kicking to prod.
const isLocal =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)

export const APP_BASE = isLocal ? '' : 'https://app.repcommish.com'
export const APP_LOGIN_URL = `${APP_BASE}/login`
export const APP_SIGNUP_URL = `${APP_BASE}/signup`
