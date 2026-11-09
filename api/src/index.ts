import { Elysia, t } from 'elysia'
import { config, developerOrigin } from './config'
import { prisma } from './db'
import { RateLimiter, hashToken, cleanName, dummyVerify, emailProblem, hashPassword, normalizeEmail, passwordProblem, verifyPassword } from './security'
import { openDownload, productKnown } from './downloads'
import { clearCookie, createSession, destroySession, getSessionUser, listSessions, purgeExpired, revokeOthers, revokeSession, sessionCookie } from './session'
import { maskIp } from './ua'
import { adminRoutes } from './admin'
import { ssoRoutes } from './sso'
import { passkeyRoutes } from './passkeys'
import { seoRoutes } from './seo'
import { catalogRoutes, collabRoutes, finishGithub, recoverReleases } from './collab'
import { sendEmailChangedNotice, sendPasswordChangedNotice, sendPasswordReset, sendVerification } from './mail'

const MINUTE = 60_000
// Failed attempts: per IP and per email (the email limiter also covers emails that do not exist,
// so lockouts cannot be used to discover accounts). `attempts` caps raw request volume.
const failByIp = new RateLimiter(10, 15 * MINUTE)
const failByEmail = new RateLimiter(5, 15 * MINUTE)
const attempts = new RateLimiter(20, MINUTE)
// Downloads are bandwidth: cap them per account.
const downloadsByUser = new RateLimiter(10, 60 * MINUTE)
// Sign-ups per IP, and wrong passwords on the account pages (a stolen session must not be able to guess
// the password there).
const registerByIp = new RateLimiter(5, 60 * MINUTE)
const accountFails = new RateLimiter(5, 15 * MINUTE)
// Verification mails: one per minute and a handful per hour per account; token guesses per IP.
const resendByUser = new RateLimiter(5, 60 * MINUTE)
const resendCooldown = new RateLimiter(1, MINUTE)
const verifyByIp = new RateLimiter(20, 15 * MINUTE)
// Forgot password: mails per IP and per address, and link guesses per IP.
const forgotByIp = new RateLimiter(5, 60 * MINUTE)
const forgotByEmail = new RateLimiter(3, 60 * MINUTE)
const resetByIp = new RateLimiter(10, 15 * MINUTE)
const ratingsByUser = new RateLimiter(20, 60 * MINUTE)
const repliesByUser = new RateLimiter(30, 60 * MINUTE)

// Apache sets X-Real-IP from the real TCP peer. This process only listens on 127.0.0.1.
const clientIp = (req: Request) => req.headers.get('x-real-ip')?.slice(0, 64) || 'unknown'

const logEvent = (email: string, success: boolean, reason: string | null, ip: string, ua: string | null) =>
  prisma.loginEvent
    .create({ data: { email: email.slice(0, 254), success, reason, ip, userAgent: ua?.slice(0, 300) ?? null } })
    .catch((e) => console.error('loginEvent failed', e))

/**
 * Guard for every /api/web/* endpoint. Only our own website, running in a browser on our own
 * origin, passes. Browsers cannot send the custom header cross-origin without a CORS preflight,
 * and this API never allows one.
 * Note: a non-browser tool can still forge these headers, so this blocks cross-site abuse, not
 * scripts. The real protection against scripts is authentication, rate limits and the lack of
 * any unauthenticated data endpoint.
 */
const webGuard = ({ request, status }: { request: Request; status: (code: number, body: unknown) => unknown }) => {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return status(403, { error: 'forbidden' })
  const origin = request.headers.get('origin')
  const isRead = request.method === 'GET' || request.method === 'HEAD'
  if (origin ? !config.origins.includes(origin) : !isRead) return status(403, { error: 'forbidden' })
  if (request.headers.get('x-requested-with') !== 'fetch') return status(403, { error: 'forbidden' })
}

/** Who answers reviews of a product: its uploader, or an admin for CXXS's own products. */
const productAuthor = async (slug: string) => {
  const p = await prisma.product.findUnique({ where: { slug }, select: { ownerId: true, author: true, owner: { select: { collaborator: { select: { publisherName: true } } } } } })
  return p ? { ownerId: p.ownerId as string | null, name: p.owner.collaborator?.publisherName ?? p.author ?? 'Developer' } : { ownerId: null as string | null, name: 'CXXS' }
}
const mayReply = (a: { ownerId: string | null }, u: { id: string; role: string }) => (a.ownerId ? u.id === a.ownerId : u.role === 'ADMIN')

const app = new Elysia({ prefix: '/api', serve: { maxRequestBodySize: 64 * 1024 } /* room for a full app description; everything else is tiny */ })
  .onRequest(({ set }) => {
    set.headers['cache-control'] = 'no-store'
    set.headers['x-content-type-options'] = 'nosniff'
    set.headers['referrer-policy'] = 'no-referrer'
  })
  .onError(({ code, error, status }) => {
    if (code === 'VALIDATION' || code === 'PARSE') return status(400, { error: 'invalid_request' })
    if (code === 'NOT_FOUND') return status(404, { error: 'not_found' })
    console.error(error)
    return status(500, { error: 'server_error' })
  })
  // Internal only: the reverse proxy always adds X-Real-IP, so a request that reaches us through the public site is hidden.
  .get('/health', ({ request, status }) => (request.headers.get('x-real-ip') ? status(404, { error: 'not_found' }) : { ok: true }))
  // GitHub sends the browser back here after "Sign in with GitHub" (a top-level navigation, so it is not under /web).
  .get('/oauth/github/callback', async ({ request, query }) => {
    const ip = clientIp(request)
    const back = (r: string) => new Response(null, { status: 302, headers: { location: `${developerOrigin ? developerOrigin + '/' : '/developers/'}?github=${r}`, 'cache-control': 'no-store' } })
    if (attempts.blockedFor(ip) > 0) return back('error')
    attempts.add(ip)
    if (!query.code || !query.state || query.error) return back('error')
    const s = await getSessionUser(request.headers.get('cookie'))
    return back(await finishGithub(s?.user.id, query.code, query.state))
  })
  .use(ssoRoutes(logEvent))
  .use(seoRoutes())
  .group('/web', (web) =>
    web
      .onBeforeHandle(webGuard as never)
      .post(
        '/auth/login',
        async ({ body, request, set, status }) => {
          const ip = clientIp(request)
          const ua = request.headers.get('user-agent')
          const email = body.email.trim().toLowerCase()

          const wait = Math.max(attempts.blockedFor(ip), failByIp.blockedFor(ip), failByEmail.blockedFor(email))
          if (wait > 0) {
            set.headers['retry-after'] = String(wait)
            return status(429, { error: 'too_many_attempts', retryAfter: wait })
          }
          attempts.add(ip)

          let ok = false
          let userId = ''
          let role = 'USER'
          let reason: string | null = null
          try {
            const user = await prisma.user.findUnique({ where: { email } })
            if (user && !user.disabled) {
              ok = await verifyPassword(body.password, user.passwordHash)
              userId = user.id
              role = user.role
              if (!ok) reason = 'bad_password'
            } else {
              await dummyVerify(body.password)
              reason = user ? 'disabled' : 'unknown_email'
            }
          } catch (e) {
            if ((e as Error).message === 'busy') return status(503, { error: 'busy' })
            throw e
          }

          if (!ok) {
            failByIp.add(ip)
            failByEmail.add(email)
            void logEvent(email, false, reason, ip, ua)
            return status(401, { error: 'invalid_credentials' })
          }

          failByEmail.clear(email)
          const token = await createSession(userId, ip, ua, 'WEB')
          set.headers['set-cookie'] = sessionCookie(token, Math.floor(config.sessionAbsoluteMs / 1000))
          void logEvent(email, true, null, ip, ua)
          return { ok: true, user: { email, name: null, role } }
        },
        {
          body: t.Object({
            email: t.String({ minLength: 3, maxLength: 254 }),
            password: t.String({ minLength: 1, maxLength: 128 }),
          }),
        },
      )
      .get('/auth/me', async ({ request, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        const { session } = s
        return {
          user: { email: s.user.email, name: s.user.name, role: s.user.role, createdAt: s.user.createdAt, emailVerified: !!s.user.emailVerifiedAt },
          session: { client: session.client, device: session.device, label: session.label, createdAt: session.createdAt },
        }
      })
      // ---------- Sign up ----------
      .post(
        '/auth/register',
        async ({ body, request, set, status }) => {
          const ip = clientIp(request)
          const ua = request.headers.get('user-agent')
          // Bots fill every field. A hidden field that stays empty for people gives them away; they get a fake success.
          if (body.website) return { ok: true, user: { email: normalizeEmail(body.email), name: null, role: 'USER' } }
          const wait = Math.max(registerByIp.blockedFor(ip), attempts.blockedFor(ip))
          if (wait > 0) {
            set.headers['retry-after'] = String(wait)
            return status(429, { error: 'too_many_attempts', retryAfter: wait })
          }
          registerByIp.add(ip)
          attempts.add(ip)

          const email = normalizeEmail(body.email)
          const name = cleanName(body.name)
          const bad = emailProblem(email) ?? (name ? null : 'Enter a name between 1 and 60 characters.') ?? passwordProblem(body.password, email)
          if (bad) return status(400, { error: 'invalid_input', message: bad })
          if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
            return status(409, { error: 'email_taken' })
          }
          let user
          try {
            user = await prisma.user.create({ data: { email, name, passwordHash: await hashPassword(body.password) } })
          } catch (e) {
            if ((e as { code?: string }).code === 'P2002') return status(409, { error: 'email_taken' }) // raced with another sign-up
            if ((e as Error).message === 'busy') return status(503, { error: 'busy' })
            throw e
          }
          const token = await createSession(user.id, ip, ua, 'WEB')
          set.headers['set-cookie'] = sessionCookie(token, Math.floor(config.sessionAbsoluteMs / 1000))
          void logEvent(email, true, 'register', ip, ua)
          void sendVerification(user.id, email, name)
          return { ok: true, user: { email, name, role: user.role } }
        },
        {
          body: t.Object({
            name: t.String({ minLength: 1, maxLength: 80 }),
            email: t.String({ minLength: 3, maxLength: 254 }),
            password: t.String({ minLength: 1, maxLength: 128 }),
            website: t.Optional(t.String({ maxLength: 200 })),
          }),
        },
      )
      .use(passkeyRoutes(webGuard as never, logEvent))
      .use(catalogRoutes(webGuard as never))
      .use(collabRoutes(webGuard as never))
      .use(adminRoutes(webGuard as never, (email, reason, req) => void logEvent(email, true, reason, clientIp(req), req.headers.get('user-agent'))))
      // ---------- Forgot password ----------
      // Always answers the same, so the form cannot be used to find out which emails have an account.
      .post(
        '/auth/forgot',
        async ({ body, request, status }) => {
          const ip = clientIp(request)
          const email = normalizeEmail(body.email)
          if (Math.max(forgotByIp.blockedFor(ip), forgotByEmail.blockedFor(email)) > 0) return status(429, { error: 'too_many_attempts' })
          forgotByIp.add(ip)
          forgotByEmail.add(email)
          void (async () => {
            const user = await prisma.user.findUnique({ where: { email } })
            if (!user || user.disabled) return
            await sendPasswordReset(user.id, user.email, user.name)
            void logEvent(email, true, 'reset_requested', ip, request.headers.get('user-agent'))
          })().catch((e) => console.error('forgot failed', e))
          return { ok: true }
        },
        { body: t.Object({ email: t.String({ minLength: 3, maxLength: 254 }) }) },
      )
      .post(
        '/auth/reset',
        async ({ body, request, status }) => {
          const ip = clientIp(request)
          if (resetByIp.blockedFor(ip) > 0) return status(429, { error: 'too_many_attempts' })
          resetByIp.add(ip)
          const row = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(body.token) }, include: { user: true } })
          if (!row || row.expiresAt < new Date() || row.user.disabled) return status(400, { error: 'invalid_token' })
          const bad = passwordProblem(body.password, row.user.email)
          if (bad) return status(400, { error: 'invalid_input', message: bad })
          const hash = await hashPassword(body.password)
          await prisma.$transaction([
            // The link went to this inbox, so the address is proven too.
            prisma.user.update({ where: { id: row.userId }, data: { passwordHash: hash, ...(row.user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }) } }),
            prisma.passwordReset.deleteMany({ where: { userId: row.userId } }),
            // Whoever had the old password (or a stolen session) is signed out everywhere.
            prisma.session.deleteMany({ where: { userId: row.userId } }),
          ])
          failByEmail.clear(row.user.email)
          void logEvent(row.user.email, true, 'password_reset', ip, request.headers.get('user-agent'))
          void sendPasswordChangedNotice(row.user.email)
          return { ok: true }
        },
        { body: t.Object({ token: t.String({ minLength: 20, maxLength: 100 }), password: t.String({ minLength: 1, maxLength: 128 }) }) },
      )
      // ---------- Email verification ----------
      .post(
        '/auth/verify-email',
        async ({ body, request, status }) => {
          const ip = clientIp(request)
          if (verifyByIp.blockedFor(ip) > 0) return status(429, { error: 'too_many_attempts' })
          verifyByIp.add(ip)
          const row = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(body.token) }, include: { user: { select: { email: true } } } })
          // Valid only while unexpired and while it still matches the account's current address.
          if (!row || row.expiresAt < new Date() || row.user.email !== row.email) return status(400, { error: 'invalid_token' })
          await prisma.$transaction([
            prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
            prisma.emailToken.deleteMany({ where: { userId: row.userId } }),
          ])
          return { ok: true, email: row.email }
        },
        { body: t.Object({ token: t.String({ minLength: 20, maxLength: 100 }) }) },
      )
      .post('/auth/resend-verification', async ({ request, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        if (s.user.emailVerifiedAt) return status(400, { error: 'already_verified' })
        const wait = Math.max(resendCooldown.blockedFor(s.user.id), resendByUser.blockedFor(s.user.id))
        if (wait > 0) return status(429, { error: 'too_many_attempts', retryAfter: wait })
        resendCooldown.add(s.user.id)
        resendByUser.add(s.user.id)
        void sendVerification(s.user.id, s.user.email, s.user.name)
        return { ok: true }
      })
      // ---------- Account ----------
      .patch(
        '/account/profile',
        async ({ body, request, status }) => {
          const s = await getSessionUser(request.headers.get('cookie'))
          if (!s) return status(401, { error: 'unauthenticated' })
          const name = cleanName(body.name)
          if (!name) return status(400, { error: 'invalid_input', message: 'Enter a name between 1 and 60 characters.' })
          await prisma.user.update({ where: { id: s.user.id }, data: { name } })
          return { ok: true, name }
        },
        { body: t.Object({ name: t.String({ minLength: 1, maxLength: 80 }) }) },
      )
      .post(
        '/account/password',
        async ({ body, request, status }) => {
          const s = await getSessionUser(request.headers.get('cookie'))
          if (!s) return status(401, { error: 'unauthenticated' })
          const wait = accountFails.blockedFor(s.user.id)
          if (wait > 0) return status(429, { error: 'too_many_attempts', retryAfter: wait })
          if (!(await verifyPassword(body.current, s.user.passwordHash))) {
            accountFails.add(s.user.id)
            return status(403, { error: 'wrong_password' })
          }
          const bad = passwordProblem(body.next, s.user.email)
          if (bad) return status(400, { error: 'invalid_input', message: bad })
          if (body.next === body.current) return status(400, { error: 'invalid_input', message: 'Choose a password you have not used just now.' })
          accountFails.clear(s.user.id)
          await prisma.user.update({ where: { id: s.user.id }, data: { passwordHash: await hashPassword(body.next) } })
          // A new password signs every other device out; this one stays.
          const r = await revokeOthers(s.user.id, s.sessionId)
          void logEvent(s.user.email, true, 'password_changed', clientIp(request), request.headers.get('user-agent'))
          return { ok: true, signedOut: r.count }
        },
        { body: t.Object({ current: t.String({ minLength: 1, maxLength: 128 }), next: t.String({ minLength: 1, maxLength: 128 }) }) },
      )
      .post(
        '/account/email',
        async ({ body, request, status }) => {
          const s = await getSessionUser(request.headers.get('cookie'))
          if (!s) return status(401, { error: 'unauthenticated' })
          // An address that was never confirmed cannot be swapped for another one.
          if (!s.user.emailVerifiedAt) return status(403, { error: 'email_unverified' })
          const wait = accountFails.blockedFor(s.user.id)
          if (wait > 0) return status(429, { error: 'too_many_attempts', retryAfter: wait })
          if (!(await verifyPassword(body.password, s.user.passwordHash))) {
            accountFails.add(s.user.id)
            return status(403, { error: 'wrong_password' })
          }
          accountFails.clear(s.user.id)
          const email = normalizeEmail(body.email)
          const bad = emailProblem(email)
          if (bad) return status(400, { error: 'invalid_input', message: bad })
          if (email === s.user.email) return status(400, { error: 'invalid_input', message: 'That is already your email.' })
          try {
            await prisma.user.update({ where: { id: s.user.id }, data: { email, emailVerifiedAt: null } })
          } catch (e) {
            if ((e as { code?: string }).code === 'P2002') return status(409, { error: 'email_taken' })
            throw e
          }
          void logEvent(email, true, `email_changed_from:${s.user.email}`.slice(0, 80), clientIp(request), request.headers.get('user-agent'))
          // The new address starts unverified: confirm it by link, and tell the old address what happened.
          void sendVerification(s.user.id, email, s.user.name)
          void sendEmailChangedNotice(s.user.email, email)
          return { ok: true, email }
        },
        { body: t.Object({ email: t.String({ minLength: 3, maxLength: 254 }), password: t.String({ minLength: 1, maxLength: 128 }) }) },
      )
      .post(
        '/account/delete',
        async ({ body, request, set, status }) => {
          const s = await getSessionUser(request.headers.get('cookie'))
          if (!s) return status(401, { error: 'unauthenticated' })
          const wait = accountFails.blockedFor(s.user.id)
          if (wait > 0) return status(429, { error: 'too_many_attempts', retryAfter: wait })
          if (!(await verifyPassword(body.password, s.user.passwordHash))) {
            accountFails.add(s.user.id)
            return status(403, { error: 'wrong_password' })
          }
          // Sessions and download records go with the account (cascade).
          await prisma.user.delete({ where: { id: s.user.id } })
          void logEvent(s.user.email, true, 'account_deleted', clientIp(request), request.headers.get('user-agent'))
          set.headers['set-cookie'] = clearCookie()
          return { ok: true }
        },
        { body: t.Object({ password: t.String({ minLength: 1, maxLength: 128 }) }) },
      )
      .get('/account/downloads', async ({ request, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        const rows = await prisma.downloadEvent.findMany({ where: { userId: s.user.id }, orderBy: { createdAt: 'desc' }, take: 50 })
        return { downloads: rows.map((r) => ({ id: r.id, product: r.product, version: r.version, createdAt: r.createdAt })) }
      })
      .get('/auth/sessions', async ({ request, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        const rows = await listSessions(s.user.id)
        return {
          sessions: rows.map((r) => ({
            id: r.id,
            client: r.client,
            device: r.device,
            label: r.label,
            ip: maskIp(r.ip),
            createdAt: r.createdAt,
            lastSeenAt: r.lastSeenAt,
            current: r.id === s.sessionId,
          })),
        }
      })
      .delete('/auth/sessions/:id', async ({ request, params, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        const r = await revokeSession(s.user.id, params.id)
        return r.count ? { ok: true } : status(404, { error: 'not_found' })
      })
      .post('/auth/logout-others', async ({ request, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        const r = await revokeOthers(s.user.id, s.sessionId)
        return { ok: true, revoked: r.count }
      })
      // Public numbers for a product: how many people downloaded it and how it is rated.
      .get('/products/:slug/stats', async ({ request, params, status }) => {
        if (!(await productKnown(params.slug))) return status(404, { error: 'not_found' })
        const product = params.slug
        const author = await productAuthor(product)
        const [total, byUser, groups, recent] = await Promise.all([
          prisma.downloadEvent.count({ where: { product } }),
          prisma.downloadEvent.groupBy({ by: ['userId'], where: { product } }),
          prisma.rating.groupBy({ by: ['stars'], where: { product }, _count: { _all: true } }),
          prisma.rating.findMany({ where: { product, comment: { not: null } }, orderBy: { updatedAt: 'desc' }, take: 6, include: { user: { select: { name: true } } } }),
        ])
        const dist = [0, 0, 0, 0, 0]
        for (const g of groups) dist[g.stars - 1] = g._count._all
        const count = dist.reduce((a, b) => a + b, 0)
        const avg = count ? dist.reduce((a, n, i) => a + n * (i + 1), 0) / count : 0
        const s = await getSessionUser(request.headers.get('cookie'))
        let mine = null as { stars: number; comment: string | null } | null
        let canRate = false
        if (s) {
          const r = await prisma.rating.findUnique({ where: { userId_product: { userId: s.user.id, product } } })
          if (r) mine = { stars: r.stars, comment: r.comment }
          canRate = (await prisma.downloadEvent.count({ where: { userId: s.user.id, product } })) > 0
        }
        return {
          users: byUser.length,
          downloads: total,
          rating: { avg: Math.round(avg * 10) / 10, count, dist },
          reviews: recent.map((r) => ({ id: r.id, stars: r.stars, comment: r.comment, name: r.user.name?.split(' ')[0] ?? 'Anonymous', at: r.updatedAt, reply: r.reply ? { text: r.reply, by: author.name, at: r.repliedAt } : null })),
          mine,
          canRate,
          canReply: !!s && mayReply(author, s.user),
        }
      })
      // Rating needs an account and a real download, so the score cannot be inflated by throwaway sign-ups.
      .put(
        '/products/:slug/rating',
        async ({ request, params, body, status }) => {
          const s = await getSessionUser(request.headers.get('cookie'))
          if (!s) return status(401, { error: 'unauthenticated' })
          if (!(await productKnown(params.slug))) return status(404, { error: 'not_found' })
          if (ratingsByUser.blockedFor(s.user.id) > 0) return status(429, { error: 'too_many_requests' })
          ratingsByUser.add(s.user.id)
          const got = await prisma.downloadEvent.count({ where: { userId: s.user.id, product: params.slug } })
          if (!got) return status(403, { error: 'download_first' })
          const comment = body.comment?.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 280) || null
          const prev = await prisma.rating.findUnique({ where: { userId_product: { userId: s.user.id, product: params.slug } } })
          await prisma.rating.upsert({
            where: { userId_product: { userId: s.user.id, product: params.slug } },
            create: { userId: s.user.id, product: params.slug, stars: body.stars, comment },
            // A reply answers one specific comment, so it goes when the comment is rewritten.
            update: { stars: body.stars, comment, ...(prev && prev.comment !== comment ? { reply: null, repliedAt: null } : {}) },
          })
          return { ok: true }
        },
        { body: t.Object({ stars: t.Integer({ minimum: 1, maximum: 5 }), comment: t.Optional(t.String({ maxLength: 400 })) }) },
      )
      // The uploader (or an admin, for CXXS's own products) answers a written review in public.
      .put(
        '/products/:slug/ratings/:id/reply',
        async ({ request, params, body, status }) => {
          const s = await getSessionUser(request.headers.get('cookie'))
          if (!s) return status(401, { error: 'unauthenticated' })
          if (!(await productKnown(params.slug))) return status(404, { error: 'not_found' })
          if (!mayReply(await productAuthor(params.slug), s.user)) return status(403, { error: 'not_author' })
          if (repliesByUser.blockedFor(s.user.id) > 0) return status(429, { error: 'too_many_requests' })
          repliesByUser.add(s.user.id)
          const text = body.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, 500)
          if (!text) return status(400, { error: 'invalid_input', message: 'Write a reply first.' })
          const r = await prisma.rating.updateMany({ where: { id: params.id, product: params.slug, comment: { not: null } }, data: { reply: text, repliedAt: new Date() } })
          if (!r.count) return status(404, { error: 'not_found' })
          return { ok: true }
        },
        { body: t.Object({ text: t.String({ minLength: 1, maxLength: 800 }) }) },
      )
      .delete('/products/:slug/ratings/:id/reply', async ({ request, params, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        if (!(await productKnown(params.slug))) return status(404, { error: 'not_found' })
        if (!mayReply(await productAuthor(params.slug), s.user)) return status(403, { error: 'not_author' })
        await prisma.rating.updateMany({ where: { id: params.id, product: params.slug }, data: { reply: null, repliedAt: null } })
        return { ok: true }
      })
      .delete('/products/:slug/rating', async ({ request, params, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        await prisma.rating.deleteMany({ where: { userId: s.user.id, product: params.slug } })
        return { ok: true }
      })
      // Only a signed-in user gets the file. It is read from a private folder and streamed from here.
      .get('/downloads/:slug', async ({ request, params, status }) => {
        const s = await getSessionUser(request.headers.get('cookie'))
        if (!s) return status(401, { error: 'unauthenticated' })
        if (!(await productKnown(params.slug))) return status(404, { error: 'not_found' })
        // Downloads are for accounts whose email address has been confirmed.
        if (!s.user.emailVerifiedAt) return status(403, { error: 'email_unverified' })
        const wait = downloadsByUser.blockedFor(s.user.id)
        if (wait > 0) return status(429, { error: 'too_many_downloads', retryAfter: wait })
        const dl = await openDownload(params.slug)
        if (!dl) return status(503, { error: 'unavailable' })
        downloadsByUser.add(s.user.id)
        void prisma.downloadEvent
          .create({ data: { userId: s.user.id, product: params.slug, version: dl.version, ip: clientIp(request), userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null } })
          .catch((e) => console.error('downloadEvent failed', e))
        return new Response(dl.file, {
          headers: {
            'content-type': dl.contentType,
            'content-length': String(dl.file.size),
            'content-disposition': `attachment; filename="${dl.file.name?.split('/').pop()}"`,
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff',
          },
        })
      })
      .post('/auth/logout', async ({ request, set }) => {
        await destroySession(request.headers.get('cookie'))
        set.headers['set-cookie'] = clearCookie()
        return { ok: true }
      }),
  )
  .listen({ port: config.port, hostname: config.host })

setInterval(() => purgeExpired().catch((e) => console.error('purge failed', e)), 60 * MINUTE).unref()
purgeExpired().catch(() => {})
void recoverReleases()

const stop = async () => {
  await app.stop()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

console.log(`API listening on http://${config.host}:${config.port}`)
