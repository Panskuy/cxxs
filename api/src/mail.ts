import { config } from './config'
import { prisma } from './db'
import { hashToken, newToken } from './security'

export const mailConfigured = !!config.resendKey && !!config.mailFrom

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function sendMail(to: string, subject: string, text: string, html: string) {
  try { await send(to, subject, text, html) } catch (e) { console.error('sendMail failed', e) }
}

async function send(to: string, subject: string, text: string, html: string) {
  if (!mailConfigured) {
    console.warn(`[mail] RESEND_API_KEY / MAIL_FROM not set. Would send to ${to}: ${subject}\n${text}`)
    return
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`)
}

const TOKEN_TTL_MS = 24 * 3600 * 1000

/** Creates a fresh link for `email` (replacing older ones) and mails it. Never throws: callers fire and forget. */
export async function sendVerification(userId: string, email: string, name: string | null) {
  try {
    const token = newToken()
    await prisma.$transaction([
      prisma.emailToken.deleteMany({ where: { userId } }),
      prisma.emailToken.create({ data: { userId, email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) } }),
    ])
    // The token is in the URL fragment: it is not sent to the server on page load, nor in Referer headers or access logs.
    const link = `${config.allowedOrigin}/verify/#${token}`
    const hi = name ? `Hi ${name},` : 'Hi,'
    await send(
      email,
      'Confirm your email for CXXS',
      `${hi}\n\nWelcome to CXXS. Confirm that this is your email address by opening the link below. It works once and expires in 24 hours.\n\n${link}\n\nIf you did not create a CXXS account, ignore this message.`,
      `<p>${esc(hi)}</p><p>Welcome to CXXS. Confirm that this is your email address. The link works once and expires in 24 hours.</p><p><a href="${link}">Confirm my email</a></p><p style="color:#666">If you did not create a CXXS account, ignore this message.</p>`,
    )
  } catch (e) {
    console.error('sendVerification failed', e)
  }
}

export async function sendEmailChangedNotice(oldEmail: string, newEmail: string) {
  try {
    await send(
      oldEmail,
      'Your email address was changed',
      `The email on your account at ${config.allowedOrigin} was changed to ${newEmail}.\n\nIf this was not you, change your password right away.`,
      `<p>The email on your account at ${esc(config.allowedOrigin)} was changed to <b>${esc(newEmail)}</b>.</p><p>If this was not you, change your password right away.</p>`,
    )
  } catch (e) {
    console.error('sendEmailChangedNotice failed', e)
  }
}

const RESET_TTL_MS = 3600 * 1000

/** Creates a one-hour reset link (replacing older ones) and mails it. Never throws. */
export async function sendPasswordReset(userId: string, email: string, name: string | null) {
  try {
    const token = newToken()
    await prisma.$transaction([
      prisma.passwordReset.deleteMany({ where: { userId } }),
      prisma.passwordReset.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
    ])
    // Token in the fragment: not sent on page load, not in Referer headers or access logs.
    const link = `${config.allowedOrigin}/reset/#${token}`
    const hi = name ? `Hi ${name},` : 'Hi,'
    await send(
      email,
      'Reset your CXXS password',
      `${hi}\n\nSomeone asked to reset the password for your CXXS account. Open the link below to choose a new one. It works once and expires in 1 hour.\n\n${link}\n\nIf this was not you, ignore this message. Your password stays the same.`,
      `<p>${esc(hi)}</p><p>Someone asked to reset the password for your CXXS account. The link works once and expires in 1 hour.</p><p><a href="${link}">Choose a new password</a></p><p style="color:#666">If this was not you, ignore this message. Your password stays the same.</p>`,
    )
  } catch (e) {
    console.error('sendPasswordReset failed', e)
  }
}

export async function sendPasswordChangedNotice(email: string) {
  try {
    await send(
      email,
      'Your CXXS password was changed',
      `The password for your account at ${config.allowedOrigin} was just reset, and every device was signed out.\n\nIf this was not you, reset it again from ${config.allowedOrigin}/reset/ and check your email account's security.`,
      `<p>The password for your account at ${esc(config.allowedOrigin)} was just reset, and every device was signed out.</p><p>If this was not you, <a href="${config.allowedOrigin}/reset/">reset it again</a> and check your email account's security.</p>`,
    )
  } catch (e) {
    console.error('sendPasswordChangedNotice failed', e)
  }
}
