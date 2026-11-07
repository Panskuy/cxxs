import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }
const post = async (path, body, method = 'POST') => {
  try {
    const r = await fetch(`/api/web/auth/passkeys/${path}`, { method, credentials: 'include', headers: H, body: body ? JSON.stringify(body) : undefined })
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }
  } catch { return { ok: false, status: 0, data: {} } }
}

export const passkeysSupported = () => { try { return browserSupportsWebAuthn() } catch { return false } }
const cancelled = (e) => e?.name === 'NotAllowedError' || e?.name === 'AbortError'

/** Sign in with a saved passkey. Resolves { ok } or { ok: false, message } (message is empty when the person cancelled). */
export async function signInWithPasskey() {
  const o = await post('login/options', {})
  if (!o.ok) return { ok: false, message: o.status === 429 ? 'Too many attempts. Try again in a minute.' : 'This is temporarily unavailable. Please try again.' }
  let response
  try { response = await startAuthentication({ optionsJSON: o.data.options }) } catch (e) { return { ok: false, message: cancelled(e) ? '' : 'Your device could not use a passkey here.' } }
  const v = await post('login/verify', { cid: o.data.cid, response })
  if (v.ok) return { ok: true }
  return { ok: false, message: v.status === 429 ? 'Too many attempts. Try again in a few minutes.' : 'No saved passkey matched. Sign in with your password, then add a passkey in your account.' }
}

export const listPasskeys = () => post('', null, 'GET')
export const removePasskey = (id, password) => post(encodeURIComponent(id), { password }, 'DELETE')

/** Create a passkey on this device and save it to the signed-in account. */
export async function addPasskey(name) {
  const o = await post('register/options', {})
  if (!o.ok) return { ok: false, message: o.data.message || 'Could not start. Please try again.' }
  let response
  try { response = await startRegistration({ optionsJSON: o.data }) } catch (e) {
    return { ok: false, message: cancelled(e) ? '' : e?.name === 'InvalidStateError' ? 'This device already has a passkey for your account.' : 'Your device could not create a passkey.' }
  }
  const v = await post('register/verify', { response, name: name || undefined })
  return v.ok ? { ok: true } : { ok: false, message: v.data.message || 'Could not save the passkey. Please try again.' }
}
