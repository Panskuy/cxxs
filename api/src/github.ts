import { createHash } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from './config'

/**
 * Talking to GitHub for collaborator apps: look up a repository and its releases, and (after an admin approves)
 * fetch one release asset into private storage. Only public repositories are accepted, and only github.com
 * download URLs (and GitHub's own CDN hosts) are ever fetched.
 */
const API = 'https://api.github.com'
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/
const CDN = /(^|\.)githubusercontent\.com$/
export const ALLOWED_EXT = ['.zip', '.exe', '.msi', '.dmg', '.pkg', '.appimage', '.deb', '.rpm', '.tar.gz', '.tgz', '.7z']
const TYPES: Record<string, string> = { '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable', '.msi': 'application/x-msi', '.dmg': 'application/x-apple-diskimage', '.pkg': 'application/octet-stream', '.appimage': 'application/octet-stream', '.deb': 'application/vnd.debian.binary-package', '.rpm': 'application/x-rpm', '.tar.gz': 'application/gzip', '.tgz': 'application/gzip', '.7z': 'application/x-7z-compressed' }

export const extOf = (name: string) => ALLOWED_EXT.find((e) => name.toLowerCase().endsWith(e)) ?? null
export const typeOf = (name: string) => TYPES[extOf(name) ?? ''] ?? 'application/octet-stream'

/** "owner/name" or a github.com URL -> { owner, name } or null. */
export function parseRepo(input: string): { owner: string; name: string } | null {
  const t = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '')
  const [owner, name, ...rest] = t.split('/')
  if (!owner || !name || rest.length > 0 || !OWNER_RE.test(owner) || !REPO_RE.test(name) || name === '.' || name === '..') return null
  return { owner, name }
}

export class GithubError extends Error {
  constructor(public code: 'not_found' | 'private' | 'rate_limited' | 'unavailable' | 'invalid', message: string) { super(message) }
}

async function gh<T>(path: string, accept = 'application/vnd.github+json'): Promise<T> {
  const headers: Record<string, string> = { accept, 'user-agent': 'CXXS-store', 'x-github-api-version': '2022-11-28' }
  // Authenticated requests get 5000 calls an hour instead of 60. A token is optional: the OAuth app's own
  // credentials give the same higher limit for public data.
  if (config.githubToken) headers.authorization = `Bearer ${config.githubToken}`
  else if (config.githubClientId && config.githubClientSecret) headers.authorization = `Basic ${Buffer.from(`${config.githubClientId}:${config.githubClientSecret}`).toString('base64')}`
  let r: Response
  try { r = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(10_000) }) } catch { throw new GithubError('unavailable', 'GitHub did not answer. Try again in a moment.') }
  if (r.status === 404) throw new GithubError('not_found', 'That repository or release was not found. It must be public.')
  if (r.status === 403 || r.status === 429) throw new GithubError('rate_limited', 'GitHub is limiting requests right now. Try again in a few minutes.')
  if (!r.ok) throw new GithubError('unavailable', `GitHub answered ${r.status}.`)
  return (accept.endsWith('.raw+json') ? await r.text() : await r.json()) as T
}

/** The repository's README as Markdown text (public repositories only). Empty string when it has none. */
export async function fetchReadme(fullName: string): Promise<string> {
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(fullName)) throw new GithubError('invalid', 'Enter a repository like owner/name.')
  try { return (await gh<string>(`/repos/${fullName}/readme`, 'application/vnd.github.raw+json')).slice(0, 200_000) } catch (e) {
    if (e instanceof GithubError && e.code === 'not_found') return ''
    throw e
  }
}

type Repo = { full_name: string; private: boolean; fork: boolean; archived: boolean; disabled: boolean; description: string | null; homepage: string | null; html_url: string; license: { spdx_id: string | null; name: string } | null; owner: { login: string; type: string } }
type Asset = { id: number; name: string; size: number; content_type: string; state: string; browser_download_url: string }
type Rel = { id: number; tag_name: string; name: string | null; draft: boolean; prerelease: boolean; published_at: string | null; html_url: string; assets: Asset[] }

export async function lookupRepo(input: string) {
  const p = parseRepo(input)
  if (!p) throw new GithubError('invalid', 'Enter a repository like owner/name or its GitHub URL.')
  const repo = await gh<Repo>(`/repos/${p.owner}/${p.name}`)
  if (repo.private) throw new GithubError('private', 'The repository must be public.')
  if (repo.archived || repo.disabled) throw new GithubError('invalid', 'That repository is archived or disabled.')
  if (repo.fork) throw new GithubError('invalid', 'Forks cannot be published. Publish your own original repository.')
  const rels = await gh<Rel[]>(`/repos/${p.owner}/${p.name}/releases?per_page=15`)
  const releases = rels
    .filter((r) => !r.draft)
    .map((r) => ({
      id: r.id, tag: r.tag_name, name: r.name || r.tag_name, prerelease: r.prerelease, publishedAt: r.published_at, url: r.html_url,
      assets: r.assets.filter((a) => a.state === 'uploaded' && extOf(a.name)).map((a) => ({ id: String(a.id), name: a.name, size: a.size, url: a.browser_download_url })),
    }))
    .filter((r) => r.assets.length > 0)
  return {
    repo: { fullName: repo.full_name, owner: repo.owner.login, ownerType: repo.owner.type, description: repo.description, homepage: repo.homepage, url: repo.html_url, license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : repo.license?.name ?? null },
    releases,
  }
}

/** Re-checks a submission against GitHub: the release exists, is published and contains this asset. */
export async function verifyAsset(repoInput: string, tag: string, assetId: string) {
  const info = await lookupRepo(repoInput)
  const rel = info.releases.find((r) => r.tag === tag)
  if (!rel) throw new GithubError('not_found', 'That release has no downloadable files, or it is a draft.')
  const asset = rel.assets.find((a) => a.id === assetId)
  if (!asset) throw new GithubError('not_found', 'That file is not part of the release.')
  return { ...info, release: rel, asset }
}

/**
 * Downloads a release asset to `dir/<releaseId>/<name>` and returns its SHA-256. Follows at most three redirects,
 * only to GitHub hosts, and refuses anything over `maxBytes` or whose size disagrees with what GitHub reported.
 */
export async function fetchAsset(url: string, name: string, expectedSize: number, dir: string, releaseId: string) {
  let u = new URL(url)
  if (u.protocol !== 'https:' || u.hostname !== 'github.com') throw new Error('unexpected download host')
  let r: Response | null = null
  for (let hop = 0; hop < 4; hop++) {
    r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'CXXS-store' }, signal: AbortSignal.timeout(120_000) })
    if (r.status >= 300 && r.status < 400) {
      const next = new URL(r.headers.get('location') ?? '', u)
      if (next.protocol !== 'https:' || !(next.hostname === 'github.com' || CDN.test(next.hostname))) throw new Error('redirected to an unexpected host')
      u = next
      continue
    }
    break
  }
  if (!r || !r.ok || !r.body) throw new Error(`download failed (${r?.status ?? 'no response'})`)
  const max = config.maxReleaseBytes
  if (expectedSize > max) throw new Error(`file is larger than the ${Math.round(max / 1048576)} MB limit`)
  const folder = join(dir, 'community', releaseId)
  await mkdir(folder, { recursive: true })
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
  const tmp = join(folder, `${safe}.part`)
  const hash = createHash('sha256')
  let total = 0
  const sink = Bun.file(tmp).writer()
  try {
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength
      if (total > max) throw new Error('file exceeds the size limit')
      hash.update(chunk)
      sink.write(chunk)
    }
    await sink.end()
  } catch (e) {
    try { await sink.end() } catch { /* already closed */ }
    await rm(tmp, { force: true })
    throw e
  }
  if (total !== expectedSize) { await rm(tmp, { force: true }); throw new Error('downloaded size does not match the release asset') }
  const final = join(folder, safe)
  await rename(tmp, final)
  return { path: final, sha256: hash.digest('hex'), size: total }
}

// ---------- Sign in with GitHub (identity only: no scopes, no stored token) ----------
export const oauthConfigured = !!(config.githubClientId && config.githubClientSecret)
export const callbackUrl = () => `${config.allowedOrigin}/api/oauth/github/callback`

export const authorizeUrl = (state: string) =>
  `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: config.githubClientId, redirect_uri: callbackUrl(), state, allow_signup: 'false' })}`

/** Trades the one-time code for the GitHub account it belongs to. The access token is used once and dropped. */
export async function identify(code: string) {
  const t = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'CXXS-store' },
    body: JSON.stringify({ client_id: config.githubClientId, client_secret: config.githubClientSecret, code, redirect_uri: callbackUrl() }),
    signal: AbortSignal.timeout(10_000),
  })
  const tok = (await t.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string }
  if (!t.ok || !tok.access_token) throw new Error(`GitHub did not accept the sign-in (${tok.error ?? t.status}${tok.error_description ? `: ${tok.error_description}` : ''})`)
  const u = await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'CXXS-store' }, signal: AbortSignal.timeout(10_000) })
  const me = (await u.json().catch(() => ({}))) as { id?: number; login?: string }
  if (!u.ok || !me.id || !me.login) throw new Error('Could not read the GitHub account')
  return { id: String(me.id), login: me.login }
}

const repoCache = new Map<string, { at: number; repos: unknown[] }>()

/**
 * Public, original repositories owned by `login` that have at least one published release with a downloadable
 * app file. Repositories without one are left out. Looks at the 50 most recently updated, a few at a time,
 * and remembers the answer for five minutes.
 */
export async function listPublishableRepos(login: string) {
  const hit = repoCache.get(login.toLowerCase())
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.repos
  const rows = await gh<{ name: string; full_name: string; description: string | null; fork: boolean; archived: boolean; disabled: boolean; pushed_at: string | null }[]>(`/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100`)
  const candidates = rows.filter((r) => !r.archived && !r.disabled && !r.fork).slice(0, 50)
  const out: { fullName: string; name: string; description: string | null; latest: string; pushedAt: string | null }[] = []
  let next = 0
  const worker = async () => {
    while (next < candidates.length) {
      const r = candidates[next++]
      try {
        const rels = await gh<Rel[]>(`/repos/${r.full_name}/releases?per_page=10`)
        const ok = rels.find((x) => !x.draft && x.assets.some((a) => a.state === 'uploaded' && extOf(a.name)))
        if (ok) out.push({ fullName: r.full_name, name: r.name, description: r.description, latest: ok.tag_name, pushedAt: r.pushed_at })
      } catch (e) {
        if (e instanceof GithubError && e.code === 'rate_limited') throw e
        // a repository we cannot read is simply not offered
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  out.sort((a, b) => String(b.pushedAt).localeCompare(String(a.pushedAt)))
  repoCache.set(login.toLowerCase(), { at: Date.now(), repos: out })
  return out
}
