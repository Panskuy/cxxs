import { COOKIE_NAME, config } from './config'
import { prisma } from './db'
import { hashToken, newToken } from './security'
import { describeUa } from './ua'

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

// __Host- prefix (when secure): browser only accepts it with Secure + Path=/ and no Domain,
// so it cannot be set by a sibling subdomain.
export function sessionCookie(token: string, maxAgeSec: number): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    ...(config.cookieSecure ? ['Secure'] : []),
  ].join('; ')
}
export const clearCookie = () => sessionCookie('', 0)

export async function createSession(userId: string, ip: string | null, userAgent: string | null, client: 'WEB' | 'MOBILE' = 'WEB') {
  const token = newToken()
  const info = describeUa(userAgent)
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      ip,
      userAgent: userAgent?.slice(0, 300) ?? null,
      client,
      device: info.device,
      label: info.label,
      expiresAt: new Date(Date.now() + config.sessionAbsoluteMs),
    },
  })
  return token
}

/** Returns the user for a valid session, or null. Enforces absolute and idle expiry. */
export async function getSessionUser(cookieHeader: string | null | undefined) {
  const token = readCookie(cookieHeader, COOKIE_NAME)
  if (!token || token.length > 128) return null
  const tokenHash = hashToken(token)
  const s = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } })
  if (!s) return null
  const now = Date.now()
  const idleExpired = now - s.lastSeenAt.getTime() > config.sessionIdleMs
  if (s.expiresAt.getTime() <= now || idleExpired || s.user.disabled) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => {})
    return null
  }
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }
  return { sessionId: s.id, tokenHash, user: s.user, session: s }
}

export async function destroySession(cookieHeader: string | null | undefined) {
  const token = readCookie(cookieHeader, COOKIE_NAME)
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

export async function purgeExpired() {
  const idleCutoff = new Date(Date.now() - config.sessionIdleMs)
  await prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { lastSeenAt: { lt: idleCutoff } }] } })
  await prisma.loginEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 3600 * 1000) } } })
}

const activeWhere = (userId: string) => ({
  userId,
  expiresAt: { gt: new Date() },
  lastSeenAt: { gt: new Date(Date.now() - config.sessionIdleMs) },
})

export const listSessions = (userId: string) =>
  prisma.session.findMany({ where: activeWhere(userId), orderBy: { lastSeenAt: 'desc' } })

/** Only deletes a session that belongs to `userId`, so one user can never revoke another's. */
export const revokeSession = (userId: string, id: string) => prisma.session.deleteMany({ where: { id, userId } })

export const revokeOthers = (userId: string, keepId: string) =>
  prisma.session.deleteMany({ where: { userId, id: { not: keepId } } })
