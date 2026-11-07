import { Elysia } from 'elysia'
import { timingSafeEqual } from 'node:crypto'
import { config, developerOrigin } from './config'
import { prisma } from './db'
import { RateLimiter, hashToken, newToken } from './security'
import { createSession, getSessionUser, readCookie, sessionCookie } from './session'

/**
 * Single sign-on between cxxs.my.id (where people sign in) and developer.cxxs.my.id (its own session).
 * Each host keeps its own host-only __Host- cookie, so a subdomain never sees the main site's cookie.
 *
 *   1. developer /api/sso/start      : remember a random state in a short cookie, go to the main site
 *   2. main      /api/sso/authorize  : signed in? make a one-time code and send the browser back (else sign in first)
 *   3. developer /api/sso/callback   : state cookie must match, the code works once, then a session for this host
 */
const CODE_TTL_MS = 60_000
const STATE_RE = /^[A-Za-z0-9_-]{20,64}$/
const STATE_COOKIE = config.cookieSecure ? '__Host-sso' : 'sso'
const codes = new Map<string, { userId: string; state: string; exp: number }>() // key = hash of the code
const limiter = new RateLimiter(30, 60_000)

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const redirect = (location: string, ...cookies: string[]) => {
  const h = new Headers({ location, 'cache-control': 'no-store' })
  for (const c of cookies) h.append('set-cookie', c)
  return new Response(null, { status: 302, headers: h })
}
const stateCookie = (value: string, maxAge: number) =>
  [`${STATE_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, ...(config.cookieSecure ? ['Secure'] : [])].join('; ')

export const ssoRoutes = (logEvent: (email: string, ok: boolean, reason: string | null, ip: string, ua: string | null) => unknown) =>
  new Elysia({ prefix: '/sso' })
    .onBeforeHandle(({ request, status }) => {
      if (!developerOrigin) return status(404, { error: 'not_found' })
      const ip = request.headers.get('x-real-ip')?.slice(0, 64) || 'unknown'
      limiter.add(ip)
      if (limiter.blockedFor(ip) > 0) return status(429, { error: 'too_many_requests' })
    })
    .get('/start', () => {
      const state = newToken()
      return redirect(`${config.allowedOrigin}/api/sso/authorize?state=${state}`, stateCookie(state, 300))
    })
    .get('/authorize', async ({ request, query }) => {
      const state = String(query.state ?? '')
      if (!STATE_RE.test(state)) return redirect(`${developerOrigin}/?sso=error`)
      const s = await getSessionUser(request.headers.get('cookie'))
      if (!s) return redirect(`/login/?next=${encodeURIComponent(`/api/sso/authorize?state=${state}`)}`)
      const now = Date.now()
      for (const [k, v] of codes) if (v.exp < now) codes.delete(k)
      if (codes.size > 2000) return redirect(`${developerOrigin}/?sso=error`)
      const code = newToken()
      codes.set(hashToken(code), { userId: s.user.id, state, exp: now + CODE_TTL_MS })
      return redirect(`${developerOrigin}/api/sso/callback?code=${code}&state=${state}`)
    })
    .get('/callback', async ({ request, query }) => {
      const fail = () => redirect(`/?sso=error`, stateCookie('', 0))
      const state = String(query.state ?? '')
      const code = String(query.code ?? '')
      const mine = readCookie(request.headers.get('cookie'), STATE_COOKIE) ?? ''
      if (!STATE_RE.test(state) || !mine || !sameText(state, mine) || !code) return fail()
      const key = hashToken(code)
      const entry = codes.get(key)
      codes.delete(key) // one use only
      if (!entry || entry.exp < Date.now() || !sameText(entry.state, state)) return fail()
      const user = await prisma.user.findUnique({ where: { id: entry.userId } })
      if (!user || user.disabled) return fail()
      const ip = request.headers.get('x-real-ip')?.slice(0, 64) || 'unknown'
      const ua = request.headers.get('user-agent')
      const token = await createSession(user.id, ip, ua, 'WEB')
      void logEvent(user.email, true, 'sso_developer', ip, ua)
      return redirect('/', sessionCookie(token, Math.floor(config.sessionAbsoluteMs / 1000)), stateCookie('', 0))
    })
