import { Elysia, t } from 'elysia'
import { prisma } from './db'
import { DIR, slugTaken, DOWNLOADS } from './downloads'
import { randomBytes } from 'node:crypto'
import { GithubError, authorizeUrl, fetchAsset, fetchReadme, identify, listPublishableRepos, lookupRepo, oauthConfigured, parseRepo, verifyAsset } from './github'
import { firstImage, firstParagraph, githubImage, normalizeMarkdown } from './markdown'
import { RateLimiter } from './security'
import { getSessionUser } from './session'
import { sendMail } from './mail'

type Guard = (ctx: never) => unknown

export const CATEGORIES = ['Utilities', 'Productivity', 'Music & Audio', 'Developer Tools', 'Games', 'Graphics & Design', 'Education', 'Other']
export const PLATFORMS = ['Windows', 'macOS', 'Linux', 'Cross-platform']

const githubLookups = new RateLimiter(20, 60 * 60_000)
const submissions = new RateLimiter(10, 24 * 60 * 60_000)
const applications = new RateLimiter(3, 24 * 60 * 60_000)

// Pending "sign in with GitHub" attempts: state -> who started it. The callback only counts when the same
// signed-in user comes back with it, so someone else's GitHub account cannot be attached to your account.
const oauthStates = new Map<string, { userId: string; exp: number }>()
const newState = (userId: string) => {
  for (const [k, v] of oauthStates) if (v.exp < Date.now()) oauthStates.delete(k)
  const state = randomBytes(24).toString('base64url')
  oauthStates.set(state, { userId, exp: Date.now() + 10 * 60_000 })
  return state
}
/** Finishes the GitHub sign-in: returns where to send the browser next. */
export async function finishGithub(userId: string | undefined, code: string, state: string) {
  const st = oauthStates.get(state)
  oauthStates.delete(state)
  if (!st || st.exp < Date.now() || !userId || st.userId !== userId) return 'error'
  try {
    const who = await identify(code)
    const existing = await prisma.githubLink.findUnique({ where: { userId } })
    const app = await prisma.collaboratorApplication.findUnique({ where: { userId } })
    if (existing && existing.githubId !== who.id && app?.status === 'APPROVED') return 'locked'
    const taken = await prisma.githubLink.findUnique({ where: { githubId: who.id } })
    if (taken && taken.userId !== userId) return 'taken'
    await prisma.githubLink.upsert({ where: { userId }, create: { userId, githubId: who.id, login: who.login }, update: { githubId: who.id, login: who.login } })
    return 'connected'
  } catch (e) {
    console.error('github sign-in failed', (e as Error).message)
    return 'error'
  }
}

const clean = (s: string | undefined | null, max: number) => (s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const cleanText = (s: string | undefined | null, max: number) => (s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max)
const GH_USER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const httpsUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString().slice(0, 200) : null } catch { return null } }

/** Only repositories owned by the GitHub account the developer proved they control (no links, no organizations). */
async function ownedBy(userId: string, repoFullName: string) {
  const link = await prisma.githubLink.findUnique({ where: { userId } })
  if (!oauthConfigured || !link) return { ok: false as const, message: 'Connect your GitHub account first.' }
  const owner = repoFullName.split('/')[0] ?? ''
  if (owner.toLowerCase() !== link.login.toLowerCase()) return { ok: false as const, message: `Only repositories owned by your GitHub account (@${link.login}) can be published.` }
  return { ok: true as const }
}

const ghMessage = (e: unknown) => (e instanceof GithubError ? e.message : 'Could not check GitHub. Try again in a moment.')
const ghStatus = (e: unknown) => (e instanceof GithubError && e.code === 'rate_limited' ? 429 : e instanceof GithubError && e.code === 'unavailable' ? 503 : 400)

/** Downloads the submitted file in the background and records its fingerprint, so the admin reviews a real file. */
export async function fetchRelease(id: string) {
  const r = await prisma.release.findUnique({ where: { id } })
  if (!r) return
  try {
    const got = await fetchAsset(r.assetUrl, r.assetName, r.assetSize, DIR, r.id)
    await prisma.release.update({ where: { id }, data: { status: 'PENDING', sha256: got.sha256, filePath: got.path, error: null } })
  } catch (e) {
    console.error('fetchRelease failed', id, (e as Error).message)
    await prisma.release.update({ where: { id }, data: { status: 'FAILED', error: clean((e as Error).message, 200) } })
  }
}

/** A restart can interrupt a download; mark those so the owner can submit again. */
export const recoverReleases = () =>
  prisma.release.updateMany({ where: { status: 'FETCHING' }, data: { status: 'FAILED', error: 'Interrupted by a server restart. Please submit again.' } }).catch(() => {})

export const publicApp = (p: { slug: string; name: string; tagline: string; summary: string; category: string; platform: string; license: string | null; requirements: string | null; repo: string; details?: string | null; cover?: string | null; external: boolean; stars: number | null; author: string | null; owner: { collaborator: { publisherName: string; github: string; website: string | null } | null } }, r: { tag: string; assetSize: number; assetName: string; releaseUrl: string; approvedAt: Date | null; sha256: string | null }, full = false) => ({
  slug: p.slug, name: p.name, tagline: p.tagline, summary: p.summary, category: p.category, platform: p.platform, license: p.license, requirements: p.requirements,
  version: r.tag, size: r.assetSize, file: r.assetName, sha256: r.sha256, repo: `https://github.com/${p.repo}`, repoName: p.repo, repoOwner: p.repo.split('/')[0], releaseUrl: r.releaseUrl, releasedAt: r.approvedAt,
  // Card picture: the first image of the description, else GitHub's generated preview card of the repository.
  cover: p.cover ?? firstImage(p.details) ?? `https://opengraph.githubassets.com/1/${p.repo}`,
  ...(full ? { details: p.details ?? null } : {}),
  price: 'Free', status: 'available', community: true, external: p.external, stars: p.stars,
  publisher: p.external && p.author ? { name: p.author, github: p.author, website: null } : p.owner.collaborator ? { name: p.owner.collaborator.publisherName, github: p.owner.collaborator.github, website: p.owner.collaborator.website } : null,
})

/** Public catalog of approved collaborator apps. */
export const catalogRoutes = (webGuard: Guard) =>
  new Elysia()
    .onBeforeHandle(({ request, status }) => (webGuard as (c: unknown) => unknown)({ request, status }))
    .get('/catalog', async () => {
      const apps = await prisma.product.findMany({
        where: { status: 'APPROVED', releases: { some: { status: 'APPROVED', OR: [{ filePath: { not: null } }, { product: { external: true } }] } } },
        orderBy: [{ stars: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: { owner: { select: { collaborator: true } }, releases: { where: { status: 'APPROVED', OR: [{ filePath: { not: null } }, { product: { external: true } }] }, orderBy: { approvedAt: 'desc' }, take: 1 } },
      })
      return { items: apps.map((a) => publicApp(a, a.releases[0])) }
    })
    // Experimental: HTTP QUERY (a safe, idempotent "GET with a body"). Same data as /catalog, filtered on the server.
    // Read-only and public, exactly like GET /catalog; the filter travels in the body instead of the URL.
    .route(
      'QUERY' as never,
      '/catalog/search',
      (async ({ body }: { body: { q?: string; category?: string; platform?: string; sort?: 'popular' | 'name'; limit?: number } }) => {
        const q = (body.q ?? '').trim().slice(0, 80)
        const apps = await prisma.product.findMany({
          where: {
            status: 'APPROVED',
            releases: { some: { status: 'APPROVED', OR: [{ filePath: { not: null } }, { product: { external: true } }] } },
            ...(body.category ? { category: body.category } : {}),
            ...(body.platform ? { platform: body.platform } : {}),
            ...(q ? { OR: ['name', 'tagline', 'summary', 'repo'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' as const } })) } : {}),
          },
          orderBy: body.sort === 'name' ? { name: 'asc' } : [{ stars: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
          take: Math.min(Math.max(body.limit ?? 50, 1), 100),
          include: { owner: { select: { collaborator: true } }, releases: { where: { status: 'APPROVED', OR: [{ filePath: { not: null } }, { product: { external: true } }] }, orderBy: { approvedAt: 'desc' }, take: 1 } },
        })
        return { items: apps.map((a) => publicApp(a, a.releases[0])), method: 'QUERY' }
      }) as never,
      {
        body: t.Object({
          q: t.Optional(t.String({ maxLength: 80 })),
          category: t.Optional(t.String({ maxLength: 40 })),
          platform: t.Optional(t.String({ maxLength: 40 })),
          sort: t.Optional(t.Union([t.Literal('popular'), t.Literal('name')])),
          limit: t.Optional(t.Number()),
        }),
      } as never,
    )
    .get('/catalog/:slug', async ({ params, status }) => {
      const a = await prisma.product.findFirst({
        where: { slug: params.slug, status: 'APPROVED', releases: { some: { status: 'APPROVED', OR: [{ filePath: { not: null } }, { product: { external: true } }] } } },
        include: { owner: { select: { collaborator: true } }, releases: { where: { status: 'APPROVED', OR: [{ filePath: { not: null } }, { product: { external: true } }] }, orderBy: { approvedAt: 'desc' }, take: 1 } },
      })
      if (!a) return status(404, { error: 'not_found' })
      return { item: publicApp(a, a.releases[0], true) }
    })

/**
 * Collaborator endpoints. Applying needs a verified email. Submitting apps needs an approved application.
 * Every app and every new release starts as pending and is invisible until an admin approves it.
 */
export const collabRoutes = (webGuard: Guard) =>
  new Elysia({ prefix: '/collab' })
    .derive(async ({ request }) => ({ auth: await getSessionUser(request.headers.get('cookie')) }))
    .onBeforeHandle(({ request, status, auth }) => {
      const blocked = (webGuard as (c: unknown) => unknown)({ request, status })
      if (blocked) return blocked
      if (!auth) return status(401, { error: 'unauthenticated' })
    })
    .get('/me', async ({ auth }) => {
      const u = auth!.user
      const application = await prisma.collaboratorApplication.findUnique({ where: { userId: u.id } })
      const link = await prisma.githubLink.findUnique({ where: { userId: u.id } })
      const apps = application?.status === 'APPROVED'
        ? await prisma.product.findMany({ where: { ownerId: u.id }, orderBy: { createdAt: 'desc' }, include: { releases: { orderBy: { createdAt: 'desc' } } } })
        : []
      return {
        emailVerified: !!u.emailVerifiedAt,
        github: { configured: oauthConfigured, login: link?.login ?? null },
        application: application && { status: application.status, publisherName: application.publisherName, github: application.github, website: application.website, about: application.about, reviewNote: application.reviewNote, createdAt: application.createdAt },
        apps: apps.map((p) => ({
          slug: p.slug, name: p.name, tagline: p.tagline, status: p.status, reviewNote: p.reviewNote, repo: p.repo, createdAt: p.createdAt,
          releases: p.releases.map((r) => ({ id: r.id, tag: r.tag, assetName: r.assetName, assetSize: r.assetSize, status: r.status, note: r.note, error: r.error, createdAt: r.createdAt })),
        })),
        categories: CATEGORIES, platforms: PLATFORMS,
      }
    })
    .post(
      '/apply',
      async ({ auth, body, status }) => {
        const u = auth!.user
        if (!u.emailVerifiedAt) return status(403, { error: 'email_unverified' })
        if (applications.blockedFor(u.id) > 0) return status(429, { error: 'too_many_attempts' })
        applications.add(u.id)
        // With GitHub sign-in set up, the username comes from the linked account (proven), not from the form.
        const link = await prisma.githubLink.findUnique({ where: { userId: u.id } })
        if (oauthConfigured && !link) return status(400, { error: 'invalid_input', message: 'Connect your GitHub account first.' })
        const github = oauthConfigured ? link!.login : clean(body.github, 39).replace(/^@/, '')
        // Signed in with GitHub: the publisher name is simply the GitHub username.
        const publisherName = oauthConfigured ? link!.login : clean(body.publisherName, 60)
        const website = body.website?.trim() ? httpsUrl(body.website.trim()) : null
        const about = cleanText(body.about, 600)
        if (!publisherName || (!oauthConfigured && publisherName.length < 2)) return status(400, { error: 'invalid_input', message: 'Enter the name to show as publisher (2 to 60 characters).' })
        if (!GH_USER.test(github)) return status(400, { error: 'invalid_input', message: 'Enter your GitHub username, for example octocat.' })
        if (body.website?.trim() && !website) return status(400, { error: 'invalid_input', message: 'The website must be a full https:// address.' })
        if (about.length < 20) return status(400, { error: 'invalid_input', message: 'Tell us a little about what you build (at least 20 characters).' })
        const existing = await prisma.collaboratorApplication.findUnique({ where: { userId: u.id } })
        if (existing && existing.status !== 'REJECTED') return status(409, { error: 'already_applied' })
        const data = { publisherName, github, website, about, status: 'PENDING' as const, reviewNote: null, reviewedAt: null }
        await prisma.collaboratorApplication.upsert({ where: { userId: u.id }, create: { userId: u.id, ...data }, update: data })
        return { ok: true }
      },
      { body: t.Object({ publisherName: t.Optional(t.String({ maxLength: 200 })), github: t.Optional(t.String({ maxLength: 100 })), website: t.Optional(t.String({ maxLength: 300 })), about: t.String({ maxLength: 2000 }) }) },
    )
    .get('/github/connect', async ({ auth, status }) => {
      if (!oauthConfigured) return status(503, { error: 'not_configured' })
      if (!auth!.user.emailVerifiedAt) return status(403, { error: 'email_unverified' })
      return { url: authorizeUrl(newState(auth!.user.id)) }
    })
    .get('/github/repos', async ({ auth, status }) => {
      const app = await prisma.collaboratorApplication.findUnique({ where: { userId: auth!.user.id } })
      if (app?.status !== 'APPROVED') return status(403, { error: 'not_collaborator' })
      if (githubLookups.blockedFor(auth!.user.id) > 0) return status(429, { error: 'too_many_attempts' })
      githubLookups.add(auth!.user.id)
      try { return { repos: await listPublishableRepos(app.github) } } catch (e) { return status(ghStatus(e), { error: 'github', message: ghMessage(e) }) }
    })
    .post('/github/disconnect', async ({ auth, status }) => {
      const app = await prisma.collaboratorApplication.findUnique({ where: { userId: auth!.user.id } })
      if (app && app.status !== 'REJECTED') return status(400, { error: 'invalid_input', message: 'You cannot disconnect GitHub while your application is active.' })
      await prisma.githubLink.deleteMany({ where: { userId: auth!.user.id } })
      return { ok: true }
    })
    // Looks up one of the developer's own repositories and its releases (owner/name only, never a link).
    .get('/github', async ({ auth, query, status }) => {
      const app = await prisma.collaboratorApplication.findUnique({ where: { userId: auth!.user.id } })
      if (app?.status !== 'APPROVED') return status(403, { error: 'not_collaborator' })
      if (githubLookups.blockedFor(auth!.user.id) > 0) return status(429, { error: 'too_many_attempts' })
      const input = (query.repo ?? '').trim()
      if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(input)) return status(400, { error: 'invalid_input', message: 'Choose a repository from your list.' })
      const own = await ownedBy(auth!.user.id, input)
      if (!own.ok) return status(403, { error: 'not_owner', message: own.message })
      githubLookups.add(auth!.user.id)
      try {
        const info = await lookupRepo(input)
        return { ...info, ownerMatches: true }
      } catch (e) {
        return status(ghStatus(e), { error: 'github', message: ghMessage(e) })
      }
    }, { query: t.Object({ repo: t.Optional(t.String({ maxLength: 200 })) }) })
    // The README of one of the developer's own repositories, cleaned up, to use as the app description.
    .get('/github/readme', async ({ auth, query, status }) => {
      const app = await prisma.collaboratorApplication.findUnique({ where: { userId: auth!.user.id } })
      if (app?.status !== 'APPROVED') return status(403, { error: 'not_collaborator' })
      if (githubLookups.blockedFor(auth!.user.id) > 0) return status(429, { error: 'too_many_attempts' })
      const input = (query.repo ?? '').trim()
      if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(input)) return status(400, { error: 'invalid_input', message: 'Choose a repository from your list.' })
      const own = await ownedBy(auth!.user.id, input)
      if (!own.ok) return status(403, { error: 'not_owner', message: own.message })
      githubLookups.add(auth!.user.id)
      try {
        const markdown = normalizeMarkdown(await fetchReadme(input), input)
        if (!markdown) return status(404, { error: 'no_readme', message: 'This repository has no README. Write the description yourself instead.' })
        return { markdown, summary: firstParagraph(markdown) }
      } catch (e) {
        return status(ghStatus(e), { error: 'github', message: ghMessage(e) })
      }
    }, { query: t.Object({ repo: t.Optional(t.String({ maxLength: 200 })) }) })
    // A new app (listing + first release).
    .post(
      '/apps',
      async ({ auth, body, status }) => {
        const u = auth!.user
        const app = await prisma.collaboratorApplication.findUnique({ where: { userId: u.id } })
        if (app?.status !== 'APPROVED') return status(403, { error: 'not_collaborator' })
        if (submissions.blockedFor(u.id) > 0) return status(429, { error: 'too_many_attempts' })
        const name = clean(body.name, 40)
        const slug = slugify(body.slug?.trim() || name)
        const tagline = clean(body.tagline, 80)
        const summary = cleanText(body.summary, 800)
        const requirements = clean(body.requirements, 120) || null
        const details = normalizeMarkdown(body.details, body.repo.trim()) || null
        // Cover: an image hosted on GitHub, or a path inside the repository (e.g. docs/cover.png).
        let cover: string | null = (body.cover ?? '').trim().slice(0, 300) || null
        if (cover && !/^https?:\/\//i.test(cover)) cover = `https://raw.githubusercontent.com/${body.repo.trim()}/HEAD/${cover.replace(/^\.?\//, '')}`
        if (cover && (!githubImage(cover) || /[\s"'<>]/.test(cover))) return status(400, { error: 'invalid_input', message: 'The cover must be an image in your repository (for example docs/cover.png) or a link to an image hosted on GitHub.' })
        if (name.length < 2) return status(400, { error: 'invalid_input', message: 'Give your app a name (2 to 40 characters).' })
        if (slug.length < 2 || slugTaken(slug)) return status(400, { error: 'invalid_input', message: 'That web address is not available. Choose a different app name.' })
        if (tagline.length < 5) return status(400, { error: 'invalid_input', message: 'Add a short tagline (5 to 80 characters).' })
        if (summary.length < 30) return status(400, { error: 'invalid_input', message: 'Describe your app in at least 30 characters.' })
        if (!CATEGORIES.includes(body.category)) return status(400, { error: 'invalid_input', message: 'Pick a category.' })
        if (!PLATFORMS.includes(body.platform)) return status(400, { error: 'invalid_input', message: 'Pick a platform.' })
        if (await prisma.product.count({ where: { ownerId: u.id } }) >= 10) return status(400, { error: 'limit', message: 'You have reached the limit of 10 apps.' })
        if (await prisma.product.findUnique({ where: { slug }, select: { id: true } })) return status(409, { error: 'slug_taken', message: 'An app with that web address already exists.' })
        if (await prisma.release.count({ where: { product: { ownerId: u.id }, status: { in: ['PENDING', 'FETCHING'] } } }) >= 3) return status(400, { error: 'limit', message: 'You already have 3 submissions waiting for review. Please wait for them to be reviewed.' })
        if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(body.repo.trim())) return status(400, { error: 'invalid_input', message: 'Choose a repository from your list.' })
        const own = await ownedBy(u.id, body.repo.trim())
        if (!own.ok) return status(403, { error: 'not_owner', message: own.message })
        let v
        try { v = await verifyAsset(body.repo, body.tag, body.assetId) } catch (e) { return status(ghStatus(e), { error: 'github', message: ghMessage(e) }) }
        submissions.add(u.id)
        const license = clean(body.license, 40) || v.repo.license
        const product = await prisma.product.create({
          data: {
            slug, ownerId: u.id, name, tagline, summary, details, cover, category: body.category, platform: body.platform, license, requirements, repo: v.repo.fullName,
            releases: { create: { tag: v.release.tag, assetId: v.asset.id, assetName: v.asset.name, assetSize: v.asset.size, assetUrl: v.asset.url, releaseUrl: v.release.url, status: 'FETCHING' } },
          },
          include: { releases: true },
        })
        void fetchRelease(product.releases[0].id)
        return { ok: true, slug }
      },
      {
        body: t.Object({
          repo: t.String({ maxLength: 200 }), tag: t.String({ maxLength: 200 }), assetId: t.String({ maxLength: 30 }),
          name: t.String({ maxLength: 120 }), slug: t.Optional(t.String({ maxLength: 60 })), tagline: t.String({ maxLength: 300 }), summary: t.String({ maxLength: 3000 }),
          category: t.String({ maxLength: 40 }), platform: t.String({ maxLength: 40 }), requirements: t.Optional(t.String({ maxLength: 300 })), license: t.Optional(t.String({ maxLength: 100 })),
          details: t.Optional(t.String({ maxLength: 40000 })), cover: t.Optional(t.String({ maxLength: 300 })),
        }),
      },
    )
    // A new version of an app you already have.
    .post(
      '/apps/:slug/releases',
      async ({ auth, params, body, status }) => {
        const u = auth!.user
        const product = await prisma.product.findUnique({ where: { slug: params.slug } })
        if (!product || product.ownerId !== u.id) return status(404, { error: 'not_found' })
        if (product.status === 'UNPUBLISHED') return status(400, { error: 'invalid_input', message: 'This app is unpublished.' })
        // A first submission that failed or was rejected can be sent again; it goes back to waiting for review.
        if (product.status === 'APPROVED' ? false : await prisma.release.count({ where: { productId: product.id, status: { in: ['PENDING', 'FETCHING', 'APPROVED'] } } })) {
          return status(400, { error: 'invalid_input', message: 'This app is already waiting for review.' })
        }
        const app = await prisma.collaboratorApplication.findUnique({ where: { userId: u.id } })
        if (app?.status !== 'APPROVED') return status(403, { error: 'not_collaborator' })
        if (submissions.blockedFor(u.id) > 0) return status(429, { error: 'too_many_attempts' })
        if (await prisma.release.count({ where: { product: { ownerId: u.id }, status: { in: ['PENDING', 'FETCHING'] } } }) >= 3) return status(400, { error: 'limit', message: 'You already have 3 submissions waiting for review.' })
        const own = await ownedBy(u.id, product.repo)
        if (!own.ok) return status(403, { error: 'not_owner', message: own.message })
        let v
        try { v = await verifyAsset(product.repo, body.tag, body.assetId) } catch (e) { return status(ghStatus(e), { error: 'github', message: ghMessage(e) }) }
        if (await prisma.release.findFirst({ where: { productId: product.id, tag: v.release.tag, status: { in: ['PENDING', 'FETCHING', 'APPROVED'] } } })) {
          return status(409, { error: 'exists', message: 'That version has already been submitted.' })
        }
        submissions.add(u.id)
        if (product.status !== 'APPROVED') await prisma.product.update({ where: { id: product.id }, data: { status: 'PENDING', reviewNote: null } })
        const r = await prisma.release.create({ data: { productId: product.id, tag: v.release.tag, assetId: v.asset.id, assetName: v.asset.name, assetSize: v.asset.size, assetUrl: v.asset.url, releaseUrl: v.release.url, status: 'FETCHING' } })
        void fetchRelease(r.id)
        return { ok: true }
      },
      { body: t.Object({ tag: t.String({ maxLength: 200 }), assetId: t.String({ maxLength: 30 }) }) },
    )
    .post('/apps/:slug/unpublish', async ({ auth, params, status }) => {
      const r = await prisma.product.updateMany({ where: { slug: params.slug, ownerId: auth!.user.id, status: 'APPROVED' }, data: { status: 'UNPUBLISHED' } })
      return r.count ? { ok: true } : status(404, { error: 'not_found' })
    })

export { parseRepo, DOWNLOADS }
export const notifyOwner = async (userId: string, subject: string, text: string) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (u) await sendMail(u.email, subject, text, `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`)
}
