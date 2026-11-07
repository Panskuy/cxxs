import { useEffect, useRef, useState } from 'react'
import { CloseIcon, MailIcon } from './icons'

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }

/** Shown when someone tries to download before confirming their email address. */
export default function VerifyModal({ email, onClose, onVerified, refresh, getVerified }) {
  const card = useRef(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    const opener = document.activeElement
    document.documentElement.classList.add('lm-open')
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const f = [...card.current.querySelectorAll('button, a[href]')].filter((n) => !n.disabled)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.documentElement.classList.remove('lm-open'); document.removeEventListener('keydown', key); opener?.focus?.() }
  }, [onClose])

  const resend = async () => {
    setBusy('send'); setMsg(null)
    try {
      const r = await fetch('/api/web/auth/resend-verification', { method: 'POST', credentials: 'include', headers: H, body: '{}' })
      if (r.ok) setMsg({ kind: 'ok', text: 'Sent. Check your inbox (and spam) and open the link.' })
      else if (r.status === 429) setMsg({ kind: 'err', text: 'Please wait a minute before asking again.' })
      else if (r.status === 400) { await refresh(); if (getVerified()) onVerified() }
      else setMsg({ kind: 'err', text: 'Could not send the email. Try again.' })
    } catch { setMsg({ kind: 'err', text: 'Cannot reach the server.' }) }
    setBusy('')
  }
  const check = async () => {
    setBusy('check'); setMsg(null)
    await refresh()
    setBusy('')
    if (getVerified()) onVerified()
    else setMsg({ kind: 'err', text: 'Not verified yet. Open the link in the email first.' })
  }

  return (
    <div className="lm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lm__card" ref={card} role="dialog" aria-modal="true" aria-labelledby="vm-title">
        <button className="lm__x" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        <span className="lm__ic"><MailIcon /></span>
        <h2 id="vm-title">Verify your email to download</h2>
        <p className="lm__text">We sent a confirmation link to <b>{email}</b>. Open it, then come back here and your download can start.</p>
        <div className="vm__act">
          <button className="lm__go" onClick={check} disabled={!!busy}>{busy === 'check' ? 'Checking…' : "I've verified, continue"}</button>
          <button className="vm__alt" onClick={resend} disabled={!!busy}>{busy === 'send' ? 'Sending…' : 'Resend email'}</button>
        </div>
        {msg && <p className={`vm__msg ${msg.kind}`} role="status">{msg.text}</p>}
        <a className="vm__link mono" href="/account/">Wrong address? Manage account</a>
      </div>
    </div>
  )
}
