import { Elysia } from 'elysia'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from './db'
import { config } from './config'
import { firstParagraph } from './markdown'

// Search-engine facing output: the sitemap, and /apps/<slug>/ with real <title>, description,
// canonical, Open Graph and JSON-LD written into the HTML (the page itself is a client-rendered app,
// which crawlers and link previews read badly).
const SITE_ROOT = process.env.SITE_ROOT ?? '/var/www/html'
const site = config.allowedOrigin

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const html = (body: string, code = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status: code, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', ...extra } })

let tpl: { mtime: number; text: string } | null = null
const template = () => {
  const f = join(SITE_ROOT, 'apps/index.html')
  if (!existsSync(f)) return null
  const m = statSync(f).mtimeMs
  if (!tpl || tpl.mtime !== m) tpl = { mtime: m, text: readFileSync(f, 'utf8') }
  return tpl.text
}

const inject = (page: string, head: string, title: string) =>
  page.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`).replace('</head>', `${head}\n  </head>`)

const withUrl = (u: string) => (/^https:\/\//.test(u) ? u : `${site}${u.startsWith('/') ? '' : '/'}${u}`)

export const seoRoutes = () =>
  new Elysia({ prefix: '/seo' })
    .get('/app/:slug', async ({ params }) => {
      const page = template()
      if (!page) return new Response('not found', { status: 404 })
      const slug = /^[a-z0-9-]{1,80}$/.test(params.slug) ? params.slug : ''
      const a = slug
        ? await prisma.product.findFirst({
            where: { slug, status: 'APPROVED', releases: { some: { status: 'APPROVED', OR: [{ filePath: { not: null } }, { product: { external: true } }] } } },
            include: { owner: { select: { collaborator: true } }, releases: { where: { status: 'APPROVED' }, orderBy: { approvedAt: 'desc' }, take: 1 } },
          })
        : null
      // Unknown or unpublished: the app shows its own "not found", and search engines are told to skip it.
      if (!a) return html(inject(page, '<meta name="robots" content="noindex" />', 'App not found | CXXS'), 404)

      const url = `${site}/apps/${a.slug}/`
      const title = `${a.name} — ${clip(a.tagline, 40)} | CXXS`
      const desc = clip((a.summary || firstParagraph(a.details ?? '', 200) || a.tagline).replace(/\s+/g, ' '), 160)
      const cover = withUrl(a.cover && /^https:\/\//.test(a.cover) ? a.cover : `https://opengraph.githubassets.com/1/${a.repo}`)
      const r = a.releases[0]
      const pub = a.owner.collaborator?.publisherName ?? a.author ?? undefined
      const ld = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: a.name,
        description: desc,
        applicationCategory: 'DesktopEnhancementApplication',
        operatingSystem: a.platform,
        url,
        image: cover,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        ...(r ? { softwareVersion: r.tag, datePublished: r.approvedAt?.toISOString(), downloadUrl: r.releaseUrl } : {}),
        ...(a.license ? { license: a.license } : {}),
        ...(pub ? { author: { '@type': 'Person', name: pub } } : {}),
      }
      const head = [
        `<meta name="description" content="${esc(desc)}" />`,
        `<link rel="canonical" href="${esc(url)}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="CXXS" />`,
        `<meta property="og:title" content="${esc(title)}" />`,
        `<meta property="og:description" content="${esc(desc)}" />`,
        `<meta property="og:url" content="${esc(url)}" />`,
        `<meta property="og:image" content="${esc(cover)}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:description" content="${esc(desc)}" />`,
        `<meta name="twitter:image" content="${esc(cover)}" />`,
        // "<" escaped so a description can never close the script tag
        `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
      ].join('\n    ')
      return html(inject(page, head, title))
    })
    .get('/sitemap', async () => {
      const urls: { loc: string; lastmod?: string }[] = [{ loc: `${site}/` }, { loc: `${site}/products/` }]
      try {
        for (const d of readdirSync(join(SITE_ROOT, 'products'), { withFileTypes: true })) {
          if (d.isDirectory() && existsSync(join(SITE_ROOT, 'products', d.name, 'index.html'))) urls.push({ loc: `${site}/products/${d.name}/` })
        }
      } catch {}
      const apps = await prisma.product.findMany({
        where: { status: 'APPROVED', releases: { some: { status: 'APPROVED', OR: [{ filePath: { not: null } }, { product: { external: true } }] } } },
        select: { slug: true, releases: { where: { status: 'APPROVED' }, orderBy: { approvedAt: 'desc' }, take: 1, select: { approvedAt: true } } },
      })
      for (const a of apps) urls.push({ loc: `${site}/apps/${a.slug}/`, lastmod: a.releases[0]?.approvedAt?.toISOString().slice(0, 10) })
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
        .join('\n')}\n</urlset>\n`
      return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
    })
