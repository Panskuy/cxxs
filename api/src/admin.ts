import { Elysia, t } from 'elysia'
import { prisma } from './db'
import { RateLimiter, verifyPassword } from './security'
import { getSessionUser } from './session'
import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { notifyOwner } from './collab'
import { DIR } from './downloads'

type Guard = (ctx: never) => unknown

const adminFails = new RateLimiter(5, 15 * 60_000)
const PAGE = 25
const pageOf = (raw?: string) => Math.max(1, Math.min(10_000, Number(raw) || 1))
const meta = (total: number, page: number) => ({ total, page, pages: Math.max(1, Math.ceil(total / PAGE)) })
const Q = t.Object({ q: t.Optional(t.String()), page: t.Optional(t.String()), status: t.Optional(t.String()), filter: t.Optional(t.String()) })
const term = (q?: string) => (q ?? '').trim().slice(0, 80)

/**
 * Admin-only endpoints. Every request must come from our own site (same guard as the rest of the API),
 * carry a valid session, and belong to a user whose role is ADMIN. Anyone else gets a plain 404, so the
 * routes do not advertise themselves. Destructive actions also ask for the admin's password again.
 */
export const adminRoutes = (webGuard: Guard, audit: (email: string, reason: string, req: Request) => void) =>
  new Elysia({ prefix: '/admin' })
    .derive(async ({ request }) => ({ admin: await getSessionUser(request.headers.get('cookie')) }))
    .onBeforeHandle(({ request, status, admin }) => {
      const blocked = (webGuard as (c: unknown) => unknown)({ request, status })
      if (blocked) return blocked
      if (!admin) return status(401, { error: 'unauthenticated' })
      if (admin.user.role !== 'ADMIN') return status(404, { error: 'not_found' })
    })
    // Per-day counts for the last 14 days (UTC days, as stored), oldest first. Days without events are zero.
    .get('/timeseries', async () => {
      const days = 14
      const since = new Date(Date.now() - (days - 1) * 24 * 3600_000)
      since.setUTCHours(0, 0, 0, 0)
      const [u, d, l] = await Promise.all([
        prisma.$queryRaw<{ day: string; n: number }[]>`SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, count(*)::int AS n FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1`,
        prisma.$queryRaw<{ day: string; n: number }[]>`SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, count(*)::int AS n FROM "DownloadEvent" WHERE "createdAt" >= ${since} GROUP BY 1`,
        prisma.$queryRaw<{ day: string; n: number }[]>`SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, count(*)::int AS n FROM "LoginEvent" WHERE success = true AND reason IS NULL AND "createdAt" >= ${since} GROUP BY 1`,
      ])
      const key = (dt: Date) => dt.toISOString().slice(0, 10)
      const rows = Array.from({ length: days }, (_, i) => key(new Date(since.getTime() + i * 24 * 3600_000)))
      const pick = (arr: { day: string; n: number }[]) => rows.map((day) => ({ day, n: arr.find((x) => x.day === day)?.n ?? 0 }))
      return { signups: pick(u), downloads: pick(d), logins: pick(l) }
    })
    .get('/overview', async () => {
      const day = new Date(Date.now() - 24 * 3600_000)
      const week = new Date(Date.now() - 7 * 24 * 3600_000)
      const [pendingCollab, pendingSubs] = await Promise.all([prisma.collaboratorApplication.count({ where: { status: 'PENDING' } }), prisma.release.count({ where: { status: 'PENDING' } })])
      const [users, verified, disabled, admins, newWeek, sessions, downloads, uniq, ratings, avg, failed, okLogins] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
        prisma.user.count({ where: { disabled: true } }),
        prisma.user.count({ where: { role: 'ADMIN' } }),
        prisma.user.count({ where: { createdAt: { gte: week } } }),
        prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
        prisma.downloadEvent.count(),
        prisma.downloadEvent.groupBy({ by: ['userId'] }).then((r) => r.length),
        prisma.rating.count(),
        prisma.rating.aggregate({ _avg: { stars: true } }),
        prisma.loginEvent.count({ where: { success: false, createdAt: { gte: day } } }),
        prisma.loginEvent.count({ where: { success: true, createdAt: { gte: day } } }),
      ])
      return {
        users, verified, unverified: users - verified, disabled, admins, newWeek, sessions,
        downloads, downloaders: uniq, ratings, avgRating: Math.round((avg._avg.stars ?? 0) * 10) / 10,
        failedLogins24h: failed, logins24h: okLogins, pendingCollab, pendingSubs,
      }
    })
    .get(
      '/users',
      async ({ query }) => {
        const q = query.q?.trim().toLowerCase().slice(0, 80)
        const filters: object[] = []
        if (q) filters.push({ OR: [{ email: { contains: q } }, { name: { contains: q, mode: 'insensitive' as const } }] })
        if (query.role === 'ADMIN' || query.role === 'USER') filters.push({ role: query.role })
        if (query.status === 'verified') filters.push({ emailVerifiedAt: { not: null }, disabled: false })
        if (query.status === 'unverified') filters.push({ emailVerifiedAt: null })
        if (query.status === 'disabled') filters.push({ disabled: true })
        const where = filters.length ? { AND: filters } : {}
        const page = Math.max(1, Number(query.page) || 1)
        const [total, rows] = await Promise.all([
          prisma.user.count({ where }),
          prisma.user.findMany({
            where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE,
            select: { id: true, email: true, name: true, role: true, disabled: true, emailVerifiedAt: true, createdAt: true, _count: { select: { downloads: true, sessions: true } } },
          }),
        ])
        return {
          total, page, pages: Math.max(1, Math.ceil(total / PAGE)),
          users: rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, disabled: u.disabled, verified: !!u.emailVerifiedAt, createdAt: u.createdAt, downloads: u._count.downloads, sessions: u._count.sessions })),
        }
      },
      { query: t.Object({ q: t.Optional(t.String()), page: t.Optional(t.String()), role: t.Optional(t.String()), status: t.Optional(t.String()) }) },
    )
    .post(
      '/users/:id/action',
      async ({ params, body, request, status, admin }) => {
        const me = admin!.user
        const target = await prisma.user.findUnique({ where: { id: params.id } })
        if (!target) return status(404, { error: 'not_found' })
        const self = target.id === me.id
        const a = body.action
        // Nobody can lock themselves out or remove the last way in.
        if (self && ['disable', 'make-user', 'delete'].includes(a)) return status(400, { error: 'invalid_input', message: 'You cannot do that to your own account.' })
        if (['make-admin', 'make-user', 'delete'].includes(a)) {
          const wait = adminFails.blockedFor(me.id)
          if (wait > 0) return status(429, { error: 'too_many_attempts', retryAfter: wait })
          if (!body.password || !(await verifyPassword(body.password, me.passwordHash))) {
            adminFails.add(me.id)
            return status(403, { error: 'wrong_password' })
          }
          adminFails.clear(me.id)
        }
        switch (a) {
          case 'disable':
            await prisma.$transaction([prisma.user.update({ where: { id: target.id }, data: { disabled: true } }), prisma.session.deleteMany({ where: { userId: target.id } })])
            break
          case 'enable': await prisma.user.update({ where: { id: target.id }, data: { disabled: false } }); break
          case 'verify': await prisma.user.update({ where: { id: target.id }, data: { emailVerifiedAt: new Date() } }); break
          case 'logout': await prisma.session.deleteMany({ where: { userId: target.id } }); break
          case 'make-admin': await prisma.user.update({ where: { id: target.id }, data: { role: 'ADMIN' } }); break
          case 'make-user':
            await prisma.$transaction([prisma.user.update({ where: { id: target.id }, data: { role: 'USER' } }), prisma.session.deleteMany({ where: { userId: target.id } })])
            break
          case 'delete': await prisma.user.delete({ where: { id: target.id } }); break
        }
        audit(me.email, `admin:${a}:${target.email}`.slice(0, 80), request)
        return { ok: true }
      },
      {
        body: t.Object({
          action: t.Union(['disable', 'enable', 'verify', 'logout', 'make-admin', 'make-user', 'delete'].map((x) => t.Literal(x)) as never),
          password: t.Optional(t.String({ maxLength: 128 })),
        }),
      },
    )
    // ---------- Collaborators ----------
    .get(
      '/collaborators',
      async ({ query }) => {
        const st = ['PENDING', 'APPROVED', 'REJECTED'].includes(query.status ?? '') ? (query.status as 'PENDING' | 'APPROVED' | 'REJECTED') : undefined
        const page = pageOf(query.page)
        const total = await prisma.collaboratorApplication.count({ where: st ? { status: st } : {} })
        const rows = await prisma.collaboratorApplication.findMany({
          where: st ? { status: st } : {}, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE,
          include: { user: { select: { email: true, name: true, emailVerifiedAt: true, githubLink: { select: { login: true } }, _count: { select: { products: true } } } } },
        })
        return { ...meta(total, page), items: rows.map((a) => ({ id: a.id, status: a.status, publisherName: a.publisherName, github: a.github, website: a.website, about: a.about, reviewNote: a.reviewNote, createdAt: a.createdAt, email: a.user.email, name: a.user.name, verified: !!a.user.emailVerifiedAt, githubVerified: a.user.githubLink?.login.toLowerCase() === a.github.toLowerCase(), apps: a.user._count.products })) }
      },
      { query: Q },
    )
    .post(
      '/collaborators/:id/review',
      async ({ params, body, request, status, admin }) => {
        const a = await prisma.collaboratorApplication.findUnique({ where: { id: params.id }, include: { user: { select: { email: true } } } })
        if (!a) return status(404, { error: 'not_found' })
        const note = (body.note ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300) || null
        const next = body.decision === 'approve' ? 'APPROVED' : 'REJECTED'
        if (body.decision === 'reject' && !note) return status(400, { error: 'invalid_input', message: 'Add a short reason so the applicant knows what to fix.' })
        await prisma.$transaction([
          prisma.collaboratorApplication.update({ where: { id: a.id }, data: { status: next, reviewNote: note, reviewedAt: new Date() } }),
          // Taking collaborator status away also takes their listed apps off the store.
          ...(next === 'REJECTED' ? [prisma.product.updateMany({ where: { ownerId: a.userId, status: 'APPROVED' }, data: { status: 'UNPUBLISHED' } })] : []),
        ])
        audit(admin!.user.email, `admin:collab-${body.decision}:${a.user.email}`.slice(0, 80), request)
        void notifyOwner(a.userId, next === 'APPROVED' ? 'You are now a CXXS collaborator' : 'Your CXXS collaborator application',
          next === 'APPROVED' ? 'Good news: your collaborator application was approved.\n\nYou can now submit your apps from the Developers page. Each app and each new version is reviewed by an admin before it is published.' : `Your collaborator application was not approved.\n\nReason: ${note}\n\nYou can update your details and apply again.`)
        return { ok: true }
      },
      { body: t.Object({ decision: t.Union([t.Literal('approve'), t.Literal('reject')]), note: t.Optional(t.String({ maxLength: 400 })) }) },
    )
    // ---------- App submissions ----------
    .get(
      '/submissions',
      async ({ query }) => {
        const ok = ['PENDING', 'FETCHING', 'APPROVED', 'REJECTED', 'FAILED']
        const st = ok.includes(query.status ?? '') ? (query.status as 'PENDING' | 'FETCHING' | 'APPROVED' | 'REJECTED' | 'FAILED') : undefined
        const page = pageOf(query.page)
        const total = await prisma.release.count({ where: st ? { status: st } : {} })
        const rows = await prisma.release.findMany({
          where: st ? { status: st } : {}, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE,
          include: { product: { include: { owner: { select: { email: true, collaborator: { select: { publisherName: true, github: true } } } } } } },
        })
        return {
          ...meta(total, page),
          items: rows.map((r) => {
            const gh = r.product.owner.collaborator?.github ?? ''
            return {
              id: r.id, status: r.status, tag: r.tag, assetName: r.assetName, assetSize: r.assetSize, sha256: r.sha256, note: r.note, error: r.error, createdAt: r.createdAt, releaseUrl: r.releaseUrl,
              first: r.product.status === 'PENDING' || r.product.status === 'REJECTED',
              product: { external: r.product.external, slug: r.product.slug, name: r.product.name, tagline: r.product.tagline, summary: r.product.summary, details: r.product.details, category: r.product.category, platform: r.product.platform, license: r.product.license, status: r.product.status, repo: r.product.repo },
              owner: { email: r.product.owner.email, publisher: r.product.owner.collaborator?.publisherName ?? '', github: gh, ownerMatches: r.product.repo.split('/')[0].toLowerCase() === gh.toLowerCase() },
            }
          }),
        }
      },
      { query: Q },
    )
    .post(
      '/submissions/:id/review',
      async ({ params, body, request, status, admin }) => {
        const r = await prisma.release.findUnique({ where: { id: params.id }, include: { product: true } })
        if (!r) return status(404, { error: 'not_found' })
        const note = (body.note ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300) || null
        if (body.decision === 'approve') {
          if (r.status !== 'PENDING' || !r.sha256 || !r.filePath) return status(400, { error: 'invalid_input', message: 'The file has not been fetched yet, so it cannot be approved.' })
          await prisma.$transaction([
            prisma.release.update({ where: { id: r.id }, data: { status: 'APPROVED', approvedAt: new Date(), note } }),
            prisma.product.update({ where: { id: r.productId }, data: { status: 'APPROVED', reviewNote: null } }),
          ])
        } else {
          if (!note) return status(400, { error: 'invalid_input', message: 'Add a short reason so the developer knows what to fix.' })
          if (r.status === 'APPROVED') return status(400, { error: 'invalid_input', message: 'Unpublish it instead.' })
          await prisma.$transaction([
            prisma.release.update({ where: { id: r.id }, data: { status: 'REJECTED', note } }),
            ...(r.product.status === 'PENDING' ? [prisma.product.update({ where: { id: r.productId }, data: { status: 'REJECTED', reviewNote: note } })] : []),
          ])
          if (r.filePath && r.filePath.startsWith(DIR + '/')) await rm(dirname(r.filePath), { recursive: true, force: true }).catch(() => {})
        }
        audit(admin!.user.email, `admin:app-${body.decision}:${r.product.slug}@${r.tag}`.slice(0, 80), request)
        void notifyOwner(r.product.ownerId, body.decision === 'approve' ? `${r.product.name} ${r.tag} is live on CXXS` : `${r.product.name} ${r.tag} was not approved`,
          body.decision === 'approve' ? `Your app ${r.product.name} (${r.tag}) was approved and is now available in the store.` : `Your submission of ${r.product.name} (${r.tag}) was not approved.\n\nReason: ${note}\n\nFix it and submit again from the Developers page.`)
        return { ok: true }
      },
      { body: t.Object({ decision: t.Union([t.Literal('approve'), t.Literal('reject')]), note: t.Optional(t.String({ maxLength: 400 })) }) },
    )
    .post('/products/:slug/unpublish', async ({ params, request, status, admin }) => {
      const r = await prisma.product.updateMany({ where: { slug: params.slug, status: 'APPROVED' }, data: { status: 'UNPUBLISHED' } })
      if (!r.count) return status(404, { error: 'not_found' })
      audit(admin!.user.email, `admin:unpublish:${params.slug}`.slice(0, 80), request)
      return { ok: true }
    })
    .get('/downloads', async ({ query }) => {
      const q = term(query.q), page = pageOf(query.page)
      const ci = { contains: q, mode: 'insensitive' as const }
      const where = q ? { OR: [{ user: { email: ci } }, { product: ci }, { ip: ci }, { version: ci }] } : {}
      const [total, rows] = await Promise.all([prisma.downloadEvent.count({ where }), prisma.downloadEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { email: true } } } })])
      return { ...meta(total, page), items: rows.map((r) => ({ id: r.id, email: r.user.email, product: r.product, version: r.version, ip: r.ip, createdAt: r.createdAt })) }
    }, { query: Q })
    .get('/logins', async ({ query }) => {
      const q = term(query.q), page = pageOf(query.page)
      const ci = { contains: q, mode: 'insensitive' as const }
      const and: object[] = []
      if (q) and.push({ OR: [{ email: ci }, { reason: ci }, { ip: ci }] })
      if (query.filter === 'failed') and.push({ success: false })
      if (query.filter === 'admin') and.push({ reason: { startsWith: 'admin:' } })
      const where = and.length ? { AND: and } : {}
      const [total, rows] = await Promise.all([prisma.loginEvent.count({ where }), prisma.loginEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE })])
      return { ...meta(total, page), items: rows.map((r) => ({ id: r.id, email: r.email, success: r.success, reason: r.reason, ip: r.ip, createdAt: r.createdAt })) }
    }, { query: Q })
    .get('/ratings', async ({ query }) => {
      const q = term(query.q), page = pageOf(query.page)
      const ci = { contains: q, mode: 'insensitive' as const }
      const where = q ? { OR: [{ user: { email: ci } }, { product: ci }, { comment: ci }] } : {}
      const [total, rows] = await Promise.all([prisma.rating.count({ where }), prisma.rating.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { email: true } } } })])
      return { ...meta(total, page), items: rows.map((r) => ({ id: r.id, email: r.user.email, product: r.product, stars: r.stars, comment: r.comment, updatedAt: r.updatedAt })) }
    }, { query: Q })
    .delete('/ratings/:id', async ({ params, request, admin }) => {
      const r = await prisma.rating.delete({ where: { id: params.id } }).catch(() => null)
      if (r) audit(admin!.user.email, `admin:delete-rating:${r.product}`.slice(0, 80), request)
      return { ok: true }
    })
