import { Elysia, t } from 'elysia'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { config } from './config'
import { prisma } from './db'
import { RateLimiter, newToken, verifyPassword } from './security'
import { createSession, getSessionUser, sessionCookie } from './session'
import { describeUa } from './ua'

/**
 * Passkeys (WebAuthn): sign in with the device's own unlock (fingerprint, face, PIN or a security key).
 * The server keeps only the public key. Signing in with a passkey always requires user verification, so
 * it is "something you have + something you are/know" in one step, and it cannot be phished: the browser
 * only releases the credential to the real site (the relying party id below).
 */
const rpID = new URL(config.allowedOrigin).hostname
const rpName = 'CXXS'
const CHALLENGE_TTL = 5 * 60_000
const MAX_PER_USER = 10

type Pending = { challenge: string; userId?: string; exp: number }
const pending = new Map<string, Pending>()
const keep = (key: string, p: Omit<Pending, 'exp'>) => {
  const now = Date.now()
  for (const [k, v] of pending) if (v.exp < now) pending.delete(k)
  if (pending.size > 5000) pending.clear()
  pending.set(key, { ...p, exp: now + CHALLENGE_TTL })
}
const take = (key: string) => {
  const p = pending.get(key)
  pending.delete(key) // a challenge works once
  return p && p.exp > Date.now() ? p : null
}

const ipOf = (req: Request) => req.headers.get('x-real-ip')?.slice(0, 64) || 'unknown'
const loginAttempts = new RateLimiter(20, 60_000)
const loginFails = new RateLimiter(8, 10 * 60_000)
const manageFails = new RateLimiter(5, 10 * 60_000)

type Guard = (c: never) => unknown
export const passkeyRoutes = (webGuard: Guard, logEvent: (email: string, ok: boolean, reason: string | null, ip: string, ua: string | null) => unknown) =>
  new Elysia({ prefix: '/auth/passkeys' })
    .derive(async ({ request }) => ({ auth: await getSessionUser(request.headers.get('cookie')) }))
    .onBeforeHandle(({ request, status }) => (webGuard as (c: unknown) => unknown)({ request, status }))

    // ---------- Sign in (no session yet) ----------
    .post('/login/options', async ({ request, status }) => {
      const ip = ipOf(request)
      loginAttempts.add(ip)
      if (loginAttempts.blockedFor(ip) > 0) return status(429, { error: 'too_many_attempts' })
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' })
      const cid = newToken()
      keep(cid, { challenge: options.challenge })
      return { cid, options }
    })
    .post(
      '/login/verify',
      async ({ request, body, set, status }) => {
        const ip = ipOf(request)
        const ua = request.headers.get('user-agent')
        loginAttempts.add(ip)
        if (loginAttempts.blockedFor(ip) > 0 || loginFails.blockedFor(ip) > 0) return status(429, { error: 'too_many_attempts' })
        const fail = () => { loginFails.add(ip); return status(401, { error: 'invalid_credentials' }) }
        const ch = take(body.cid)
        if (!ch) return fail()
        const cred = await prisma.passkey.findUnique({ where: { credentialId: String(body.response?.id ?? '') }, include: { user: true } })
        if (!cred || cred.user.disabled) return fail()
        try {
          const v = await verifyAuthenticationResponse({
            response: body.response,
            expectedChallenge: ch.challenge,
            expectedOrigin: config.allowedOrigin,
            expectedRPID: rpID,
            requireUserVerification: true,
            credential: { id: cred.credentialId, publicKey: new Uint8Array(cred.publicKey), counter: cred.counter, transports: cred.transports as never },
          })
          if (!v.verified) return fail()
          await prisma.passkey.update({ where: { id: cred.id }, data: { counter: v.authenticationInfo.newCounter, backedUp: v.authenticationInfo.credentialBackedUp, lastUsedAt: new Date() } })
        } catch {
          void logEvent(cred.user.email, false, 'passkey_failed', ip, ua)
          return fail()
        }
        loginFails.clear(ip)
        const token = await createSession(cred.userId, ip, ua, 'WEB')
        set.headers['set-cookie'] = sessionCookie(token, Math.floor(config.sessionAbsoluteMs / 1000))
        void logEvent(cred.user.email, true, 'passkey', ip, ua)
        return { ok: true, user: { email: cred.user.email, name: cred.user.name, role: cred.user.role } }
      },
      { body: t.Object({ cid: t.String({ maxLength: 100 }), response: t.Any() }) },
    )

    // ---------- Manage (signed in) ----------
    .get('/', async ({ auth, status }) => {
      if (!auth) return status(401, { error: 'unauthenticated' })
      const list = await prisma.passkey.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: 'asc' } })
      return { passkeys: list.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt, backedUp: p.backedUp, deviceType: p.deviceType })) }
    })
    .post('/register/options', async ({ auth, status }) => {
      if (!auth) return status(401, { error: 'unauthenticated' })
      const u = auth.user
      const existing = await prisma.passkey.findMany({ where: { userId: u.id }, select: { credentialId: true, transports: true } })
      if (existing.length >= MAX_PER_USER) return status(400, { error: 'limit', message: `You can save up to ${MAX_PER_USER} passkeys. Remove one first.` })
      const options = await generateRegistrationOptions({
        rpName, rpID,
        userName: u.email,
        userDisplayName: u.name || u.email,
        userID: new TextEncoder().encode(u.id),
        attestationType: 'none',
        excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports as never })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      })
      keep(`reg:${u.id}`, { challenge: options.challenge, userId: u.id })
      return options
    })
    .post(
      '/register/verify',
      async ({ auth, request, body, status }) => {
        if (!auth) return status(401, { error: 'unauthenticated' })
        const u = auth.user
        const ch = take(`reg:${u.id}`)
        if (!ch) return status(400, { error: 'expired', message: 'That took too long. Start again.' })
        try {
          const v = await verifyRegistrationResponse({
            response: body.response, expectedChallenge: ch.challenge, expectedOrigin: config.allowedOrigin, expectedRPID: rpID, requireUserVerification: true,
          })
          if (!v.verified || !v.registrationInfo) return status(400, { error: 'invalid', message: 'Your device could not confirm the passkey.' })
          const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo
          const fallback = describeUa(request.headers.get('user-agent')).label || 'Passkey'
          const name = (body.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) || fallback
          await prisma.passkey.create({
            data: { userId: u.id, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: credential.counter, transports: credential.transports ?? [], deviceType: credentialDeviceType, backedUp: credentialBackedUp, name },
          })
          void logEvent(u.email, true, 'passkey_added', ipOf(request), request.headers.get('user-agent'))
          return { ok: true }
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002') return status(409, { error: 'exists', message: 'This passkey is already saved.' })
          return status(400, { error: 'invalid', message: 'Your device could not confirm the passkey.' })
        }
      },
      { body: t.Object({ response: t.Any(), name: t.Optional(t.String({ maxLength: 80 })) }) },
    )
    // Removing a passkey asks for the password, like other sensitive account changes.
    .delete(
      '/:id',
      async ({ auth, request, params, body, status }) => {
        if (!auth) return status(401, { error: 'unauthenticated' })
        const u = auth.user
        if (manageFails.blockedFor(u.id) > 0) return status(429, { error: 'too_many_attempts' })
        if (!(await verifyPassword(body.password, u.passwordHash))) { manageFails.add(u.id); return status(403, { error: 'wrong_password' }) }
        manageFails.clear(u.id)
        const r = await prisma.passkey.deleteMany({ where: { id: params.id, userId: u.id } })
        if (!r.count) return status(404, { error: 'not_found' })
        void logEvent(u.email, true, 'passkey_removed', ipOf(request), request.headers.get('user-agent'))
        return { ok: true }
      },
      { body: t.Object({ password: t.String({ maxLength: 128 }) }) },
    )
