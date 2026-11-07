// Lists popular open-source desktop apps from GitHub in the store (real data only: name, description, license,
// stars, latest release). Downloads stay on GitHub, and every listing credits its original author.
//
//   bun run seed:github              shows what would be added (nothing is written)
//   bun run seed:github -- --apply   writes it to the database
//   options: --limit 30   --per-category 6   --min-stars 3000   --exclude owner/name,owner/name
import { randomBytes } from 'node:crypto'
import { extOf } from '../src/github'
import { slugTaken } from '../src/downloads'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const num = (flag: string, d: number) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) || d : d }
const LIMIT = num('--limit', 30), PER_CAT = num('--per-category', 6), MIN_STARS = num('--min-stars', 3000)
const EXCLUDE = new Set(((args[args.indexOf('--exclude') + 1] ?? '').split(',').filter(Boolean)).map((x) => x.toLowerCase()))
// Projects that are not installable apps (documentation, lists) even though they ship release files.
const NOT_APPS = new Set(['jaywcjlove/linux-command'])

// category -> GitHub topics to search
const TOPICS: Record<string, string[]> = {
  Productivity: ['note-taking', 'markdown-editor', 'todo'],
  'Music & Audio': ['music-player', 'audio-player'],
  'Developer Tools': ['api-client', 'database-client', 'terminal-emulator', 'git-client'],
  Utilities: ['screenshot', 'launcher', 'clipboard-manager', 'password-manager', 'download-manager', 'file-manager'],
  'Graphics & Design': ['image-editor', 'screen-recorder', 'video-editor'],
}

const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'CXXS-store-seed', 'x-github-api-version': '2022-11-28' }
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
else if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) headers.authorization = `Basic ${Buffer.from(`${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`).toString('base64')}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function gh<T>(path: string): Promise<T | null> {
  const r = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(15_000) })
  if (r.status === 404) return null
  if (r.status === 403 || r.status === 429) throw new Error(`GitHub rate limit (${r.status}). Wait a few minutes or set GITHUB_TOKEN.`)
  if (!r.ok) throw new Error(`GitHub ${r.status} for ${path}`)
  return (await r.json()) as T
}

type Repo = { name: string; full_name: string; description: string | null; stargazers_count: number; license: { spdx_id: string | null } | null; owner: { login: string }; fork: boolean; archived: boolean; html_url: string; topics?: string[] }
type Rel = { tag_name: string; html_url: string; draft: boolean; prerelease: boolean; assets: { id: number; name: string; size: number; state: string; browser_download_url: string }[] }

const PREFERRED = ['.exe', '.msi', '.dmg', '.appimage', '.pkg', '.deb', '.zip', '.rpm', '.tar.gz', '.tgz', '.7z']
function platformOf(names: string[]) {
  const n = names.map((x) => x.toLowerCase())
  const win = n.some((x) => /\.(exe|msi)$/.test(x) || /win/.test(x)), mac = n.some((x) => /\.(dmg|pkg)$/.test(x) || /mac|darwin|osx/.test(x)), lin = n.some((x) => /\.(appimage|deb|rpm)$/.test(x) || /linux/.test(x))
  const count = [win, mac, lin].filter(Boolean).length
  return count >= 2 ? 'Cross-platform' : win ? 'Windows' : mac ? 'macOS' : lin ? 'Linux' : 'Cross-platform'
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const trim = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…')

type Pick = { category: string; repo: Repo; rel: Rel; asset: Rel['assets'][number]; platform: string; license: string }
const picked = new Map<string, Pick>()
const perCat: Record<string, number> = {}

for (const [category, topics] of Object.entries(TOPICS)) {
  for (const topic of topics) {
    if ((perCat[category] ?? 0) >= PER_CAT) break
    const q = encodeURIComponent(`topic:${topic} stars:>${MIN_STARS} archived:false fork:false`)
    const found = await gh<{ items: Repo[] }>(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=12`)
    await sleep(2200) // search is limited to 30 requests a minute
    for (const repo of found?.items ?? []) {
      if ((perCat[category] ?? 0) >= PER_CAT) break
      if (picked.has(repo.full_name) || repo.fork || repo.archived || EXCLUDE.has(repo.full_name.toLowerCase()) || NOT_APPS.has(repo.full_name.toLowerCase())) continue
      const spdx = repo.license?.spdx_id
      if (!spdx || spdx === 'NOASSERTION') continue // only clearly licensed open source
      if (!repo.description || repo.description.length < 15) continue
      const rel = await gh<Rel>(`/repos/${repo.full_name}/releases/latest`)
      if (!rel || rel.draft || rel.prerelease || /(alpha|beta|rc\d*|preview|nightly|canary)/i.test(rel.tag_name)) continue
      const usable = rel.assets.filter((a) => a.state === 'uploaded' && extOf(a.name))
      if (!usable.length) continue
      const asset = [...usable].sort((a, b) => PREFERRED.indexOf(extOf(a.name)!) - PREFERRED.indexOf(extOf(b.name)!))[0]
      picked.set(repo.full_name, { category, repo, rel, asset, platform: platformOf(usable.map((a) => a.name)), license: spdx })
      perCat[category] = (perCat[category] ?? 0) + 1
    }
  }
}

const list = [...picked.values()].sort((a, b) => b.repo.stargazers_count - a.repo.stargazers_count).slice(0, LIMIT)
console.log(`${list.length} apps found${apply ? '' : ' (dry run: nothing is written, add --apply to save)'}:\n`)
for (const p of list) console.log(`${String(p.repo.stargazers_count).padStart(7)} stars  ${p.repo.full_name.padEnd(38)} ${p.rel.tag_name.padEnd(14)} ${p.license.padEnd(12)} ${p.platform.padEnd(15)} ${p.category}`)
if (!apply) process.exit(0)

const { prisma } = await import('../src/db')
const { hashPassword } = await import('../src/security')
// A locked account (cannot sign in) that owns the listings we add ourselves.
const SYSTEM_EMAIL = 'catalog@cxxs.my.id'
const system = (await prisma.user.findUnique({ where: { email: SYSTEM_EMAIL } }))
  ?? (await prisma.user.create({ data: { email: SYSTEM_EMAIL, name: 'CXXS Catalog', passwordHash: await hashPassword(randomBytes(32).toString('base64url')), disabled: true, emailVerifiedAt: new Date() } }))

let added = 0, updated = 0
for (const p of list) {
  const existing = await prisma.product.findFirst({ where: { repo: p.repo.full_name, external: true } })
  if (existing) { await prisma.product.update({ where: { id: existing.id }, data: { stars: p.repo.stargazers_count } }); updated++; continue }
  let slug = slugify(p.repo.name)
  if (slug.length < 2 || slugTaken(slug) || (await prisma.product.findUnique({ where: { slug }, select: { id: true } }))) slug = slugify(`${p.repo.name}-${p.repo.owner.login}`)
  if (await prisma.product.findUnique({ where: { slug }, select: { id: true } })) continue
  const desc = p.repo.description!.replace(/:[a-z0-9_+-]+:/gi, '').replace(/\s+/g, ' ').trim()
  await prisma.product.create({
    data: {
      slug, ownerId: system.id, name: p.repo.name, tagline: trim(desc, 80), summary: desc, category: p.category, platform: p.platform, license: p.license,
      repo: p.repo.full_name, external: true, stars: p.repo.stargazers_count, author: p.repo.owner.login, status: 'APPROVED',
      releases: { create: { tag: p.rel.tag_name, assetId: String(p.asset.id), assetName: p.asset.name, assetSize: p.asset.size, assetUrl: p.asset.browser_download_url, releaseUrl: p.rel.html_url, status: 'APPROVED', approvedAt: new Date() } },
    },
  })
  added++
}
console.log(`\nDone: ${added} added, ${updated} refreshed (stars).`)
await prisma.$disconnect()
