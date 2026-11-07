import { useState } from 'react'
import Layout, { Brand } from './Layout'
import { PasswordMeter } from './AuthForm'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const post = (path, body) =>
  fetch(`/api/web/auth/${path}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify(body),
  })

// Taken from the link (/reset/#<token>) once, then removed from the address bar so it does not linger in history.
const takeToken = () => {
  const t = location.hash.slice(1)
  if (t) history.replaceState(null, '', location.pathname)
  return t
}

function Request() {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const submit = async (ev) => {
    ev.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return setErr('Enter a valid email address.')
    setErr(''); setLoading(true)
    try {
      const r = await post('forgot', { email: email.trim() })
      if (r.ok) setSent(true)
      else if (r.status === 429) setErr('Too many requests. Please try again in a little while.')
      else setErr('This is temporarily unavailable. Please try again in a moment.')
    } catch { setErr('Cannot reach the server. Check your connection and try again.') }
    setLoading(false)
  }
  if (sent) return (
    <>
      <h1>Check your email</h1>
      <p>If an account exists for <b>{email.trim()}</b>, we sent a link to choose a new password. It works once and expires in 1 hour. Check your spam folder too.</p>
      <p className="lm__foot mono"><a className="lm__link" href="/login/">Back to sign in</a></p>
    </>
  )
  return (
    <>
      <h1>Forgot your password?</h1>
      <p>Enter your email and we will send you a link to choose a new one.</p>
      <form onSubmit={submit} noValidate className="af">
        <div className={`lf ${err ? 'has-err' : ''}`}>
          <label htmlFor="rs-email" className="mono">Email</label>
          <input id="rs-email" type="email" inputMode="email" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={!!err} />
          {err && <span className="lf__err" role="alert">{err}</span>}
        </div>
        <button className="lm__go" type="submit" disabled={loading}>
          {loading ? <span className="lm__spin" aria-label="Please wait" /> : <>Send reset link <span aria-hidden="true">→</span></>}
        </button>
        <p className="lm__foot mono">Remembered it? <a className="lm__link" href="/login/">Sign in</a></p>
      </form>
    </>
  )
}

function Choose({ token }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [bad, setBad] = useState(false)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const submit = async (ev) => {
    ev.preventDefault()
    if (pw.length < 12) return setErr('Password must be at least 12 characters.')
    setErr(''); setLoading(true)
    try {
      const r = await post('reset', { token, password: pw })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setDone(true)
      else if (r.status === 400 && d.error === 'invalid_input') setErr(d.message || 'Please choose a different password.')
      else if (r.status === 400) setBad(true)
      else if (r.status === 429) setErr('Too many attempts. Please try again in a few minutes.')
      else setErr('This is temporarily unavailable. Please try again in a moment.')
    } catch { setErr('Cannot reach the server. Check your connection and try again.') }
    setLoading(false)
  }
  if (done) return (
    <>
      <h1>Password changed</h1>
      <p>Your password was updated and every device was signed out. Sign in with the new password.</p>
      <a className="lm__go" href="/login/" style={{ textAlign: 'center', textDecoration: 'none' }}>Sign in <span aria-hidden="true">→</span></a>
    </>
  )
  if (bad) return (
    <>
      <h1>This link did not work</h1>
      <p>It may have expired (links last 1 hour), been used already, or been replaced by a newer one.</p>
      <a className="lm__go" href="/reset/" style={{ textAlign: 'center', textDecoration: 'none' }}>Request a new link <span aria-hidden="true">→</span></a>
    </>
  )
  return (
    <>
      <h1>Choose a new password</h1>
      <p>You will be signed out on all devices.</p>
      <form onSubmit={submit} noValidate className="af">
        <div className={`lf ${err ? 'has-err' : ''}`}>
          <label htmlFor="rs-pw" className="mono">New password</label>
          <div className="lf__row">
            <input id="rs-pw" type={show ? 'text' : 'password'} autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••••••" aria-invalid={!!err} />
            <button type="button" className="lf__toggle mono" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </div>
          {err && <span className="lf__err" role="alert">{err}</span>}
          <PasswordMeter value={pw} />
        </div>
        <button className="lm__go" type="submit" disabled={loading}>
          {loading ? <span className="lm__spin" aria-label="Please wait" /> : <>Change password <span aria-hidden="true">→</span></>}
        </button>
      </form>
    </>
  )
}

export default function Reset() {
  const [token] = useState(takeToken) // lazy: runs once, so StrictMode cannot lose the token
  return (
    <Layout banner={false}>
      <div className="lp"><div className="lp__card"><Brand />{token ? <Choose token={token} /> : <Request />}</div></div>
    </Layout>
  )
}
