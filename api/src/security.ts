import { createHash, randomBytes } from 'node:crypto'

// ---------- Password hashing (argon2id, OWASP-recommended parameters) ----------
const ARGON = { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 } as const

// Argon2 is memory hungry. Cap concurrent hashes so a burst of logins cannot exhaust RAM.
const MAX_CONCURRENT = 2
const MAX_QUEUE = 20
let running = 0
const queue: Array<() => void> = []

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    if (queue.length >= MAX_QUEUE) throw new Error('busy')
    await new Promise<void>((resolve) => queue.push(resolve))
  }
  running++
  try {
    return await fn()
  } finally {
    running--
    queue.shift()?.()
  }
}

export const hashPassword = (pw: string) => limited(() => Bun.password.hash(pw, ARGON))

export const verifyPassword = (pw: string, hash: string) =>
  limited(() => Bun.password.verify(pw, hash)).catch(() => false)

// Verified when the email is unknown, so response time does not reveal which emails exist.
let dummyHash: Promise<string> | undefined
export const dummyVerify = async (pw: string) => {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  await verifyPassword(pw, await dummyHash)
}

// ---------- Session tokens ----------
export const newToken = () => randomBytes(32).toString('base64url')
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

// ---------- Sliding-window rate limiter (in memory, single process) ----------
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(private max: number, private windowMs: number) {
    setInterval(() => this.sweep(), 60_000).unref()
  }
  private recent(key: string, now: number) {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (arr.length) this.hits.set(key, arr)
    else this.hits.delete(key)
    return arr
  }
  /** Seconds to wait if the key is over the limit, otherwise 0. */
  blockedFor(key: string): number {
    const now = Date.now()
    const arr = this.recent(key, now)
    if (arr.length < this.max) return 0
    return Math.ceil((arr[0] + this.windowMs - now) / 1000)
  }
  add(key: string) {
    const now = Date.now()
    const arr = this.recent(key, now)
    arr.push(now)
    this.hits.set(key, arr)
  }
  clear(key: string) {
    this.hits.delete(key)
  }
  private sweep() {
    const now = Date.now()
    for (const k of this.hits.keys()) this.recent(k, now)
  }
}

// ---------- Password policy ----------
export function passwordProblem(pw: string, email: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.'
  if (pw.length > 128) return 'Password must be at most 128 characters.'
  if (pw.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4)
    return 'Password must not contain your email name.'
  if (/^(.)\1+$/.test(pw)) return 'Password is too repetitive.'
  const common = ['password', 'passw0rd', '123456789', 'qwertyuiop', 'iloveyou', 'administrator']
  if (common.some((c) => pw.toLowerCase().includes(c))) return 'Password is too common.'
  return null
}

// ---------- Account input rules ----------
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const normalizeEmail = (e: string) => e.trim().toLowerCase()
export const emailProblem = (e: string): string | null =>
  e.length > 254 || !EMAIL_RE.test(e) ? 'Enter a valid email address.' : null

/** A display name: 1-60 characters, no control characters. Returns the cleaned name or null if invalid. */
export function cleanName(raw: string): string | null {
  const n = raw.replace(/\s+/g, ' ').trim()
  // eslint-disable-next-line no-control-regex
  if (n.length < 1 || n.length > 60 || /[\u0000-\u001f\u007f<>]/.test(n)) return null
  return n
}
