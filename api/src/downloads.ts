import { join, resolve } from 'node:path'
import { prisma } from './db'

/**
 * Files that signed-in users may download. They live outside every web root and are only ever streamed by
 * the API after a session check. The slug in the URL is looked up (in the table below for our own apps, in
 * the database for collaborator apps), never used as a path, so there is nothing to traverse. Each file is
 * verified against its recorded SHA-256 before it is served.
 */
export const DIR = resolve(process.env.DOWNLOAD_DIR ?? join(import.meta.dir, '..', 'private', 'downloads'))

export type Download = { file: string; version: string; contentType: string; sha256: string }

export const DOWNLOADS: Record<string, Download> = {
  notch: {
    file: 'notch-woy-v0.3.0-windows-x64.zip',
    version: 'v0.3.0',
    contentType: 'application/zip',
    // Matches the digest GitHub publishes for this release asset.
    sha256: '3ac5a04e9ab5e3eab11c85e62e0b6e6763d42e00526e297e3a05837632faf775',
  },
}

/** Slugs collaborators cannot take: our own apps, and names that would collide with site paths. */
const RESERVED = new Set(['admin', 'api', 'apps', 'account', 'login', 'verify', 'products', 'developers', 'assets', 'new', 'app', 'static', 'community'])
export const slugTaken = (slug: string) => Object.hasOwn(DOWNLOADS, slug) || RESERVED.has(slug)

/** The release people download for a collaborator app: its newest approved one. */
export const currentRelease = (slug: string) =>
  prisma.release.findFirst({
    where: { status: 'APPROVED', filePath: { not: null }, product: { slug, status: 'APPROVED' } },
    orderBy: { approvedAt: 'desc' },
    include: { product: { select: { slug: true, name: true } } },
  })

/** True when `slug` is something that can be downloaded, rated and counted. */
export async function productKnown(slug: string) {
  if (Object.hasOwn(DOWNLOADS, slug)) return true
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return false
  return !!(await currentRelease(slug))
}

async function sha256Of(file: ReturnType<typeof Bun.file>) {
  const h = new Bun.CryptoHasher('sha256')
  for await (const chunk of file.stream()) h.update(chunk)
  return h.digest('hex')
}

const verified = new Map<string, boolean>()

/** Returns the file for `slug` if it exists on disk and still matches its recorded hash. */
export async function openDownload(slug: string) {
  let meta: Download | null = null
  let path = ''
  if (Object.hasOwn(DOWNLOADS, slug)) {
    meta = DOWNLOADS[slug]
    path = join(DIR, meta.file)
  } else if (/^[a-z0-9-]{2,40}$/.test(slug)) {
    const r = await currentRelease(slug)
    if (r?.filePath && r.sha256 && r.filePath.startsWith(DIR + '/')) {
      meta = { file: r.assetName, version: r.tag, contentType: (await import('./github')).typeOf(r.assetName), sha256: r.sha256 }
      path = r.filePath
    }
  }
  if (!meta) return null
  const file = Bun.file(path)
  if (!(await file.exists())) return null
  const key = `${slug}:${meta.sha256}:${file.size}`
  if (!verified.has(key)) {
    const ok = (await sha256Of(file)) === meta.sha256
    verified.set(key, ok)
    if (!ok) console.error(`download ${slug}: hash mismatch, refusing to serve`)
  }
  return verified.get(key) ? { ...meta, file } : null
}
