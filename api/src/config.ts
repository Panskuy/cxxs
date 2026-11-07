const required = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Only the local reverse proxy (Caddy) should reach this process.
  host: process.env.HOST ?? '127.0.0.1',
  databaseUrl: required('DATABASE_URL'),
  // Exact origin of the site, e.g. https://cxxs.my.id. Used to reject cross-site requests.
  allowedOrigin: required('ALLOWED_ORIGIN').replace(/\/$/, ''),
  origins: [] as string[],
  // Disable only for local http development.
  cookieSecure: (process.env.COOKIE_SECURE ?? 'true') !== 'false',
  // Outgoing mail through Resend's HTTPS API (no SMTP ports needed). Without a key, links are only logged.
  // Optional: raises GitHub's API limit from 60 to 5000 requests an hour. Public data only, so no scopes are needed.
  githubToken: process.env.GITHUB_TOKEN ?? '',
  // GitHub OAuth app (Settings > Developer settings > OAuth Apps). Lets developers prove which GitHub account is theirs.
  githubClientId: process.env.GITHUB_CLIENT_ID ?? '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  maxReleaseBytes: Number(process.env.MAX_RELEASE_MB ?? 200) * 1024 * 1024,
  resendKey: process.env.RESEND_API_KEY ?? '',
  mailFrom: process.env.MAIL_FROM ?? '',
  sessionAbsoluteMs: Number(process.env.SESSION_ABSOLUTE_DAYS ?? 7) * 24 * 3600 * 1000,
  sessionIdleMs: Number(process.env.SESSION_IDLE_HOURS ?? 24) * 3600 * 1000,
}

export const COOKIE_NAME = config.cookieSecure ? '__Host-sid' : 'sid'

// The site itself, plus an optional separate address for the admin page (e.g. https://admin.cxxs.my.id).
export const adminOrigin = (process.env.ADMIN_ORIGIN ?? '').replace(/\/$/, '')
// Developer portal on its own subdomain (e.g. https://developer.cxxs.my.id). It has its own session, obtained through /api/sso (see sso.ts).
export const developerOrigin = (process.env.DEVELOPER_ORIGIN ?? '').replace(/\/$/, '')
config.origins = [config.allowedOrigin, ...[adminOrigin, developerOrigin].filter(Boolean)]
