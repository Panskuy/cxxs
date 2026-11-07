import { useState } from 'react'
import { passkeysSupported, signInWithPasskey } from './passkey'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// A rough guide only: the server applies the real rules.
export function strength(pw) {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 12) s++
  if (pw.length >= 16) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  if (pw.length < 12) return 1
  return s >= 5 ? 4 : s >= 4 ? 3 : 2
}
const LABELS = ['', 'Too short or weak', 'Fair', 'Good', 'Strong']

export function PasswordMeter({ value }) {
  const n = strength(value)
  return (
    <div className="meter" data-n={n} aria-live="polite">
      <div className="meter__bars" aria-hidden="true">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</div>
      <span className="mono">{value ? LABELS[n] : 'At least 12 characters'}</span>
    </div>
  )
}

/** Sign in / create account, shared by the popup and the sign-in page. */
export default function AuthForm({ mode, onMode, onSuccess, idp = 'af', autoFocus = true }) {
  const register = mode === 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [website, setWebsite] = useState('') // honeypot: people never see it, bots fill it
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ text: '', taken: false })
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(0)

  const fail = (text, taken = false) => { setStatus({ text, taken }); setShake((n) => n + 1) }
  const usePasskey = async () => {
    setStatus({ text: '', taken: false }); setLoading(true)
    const r = await signInWithPasskey()
    setLoading(false)
    if (r.ok) await onSuccess({ mode: 'login' })
    else if (r.message) fail(r.message)
  }

  const submit = async (ev) => {
    ev.preventDefault()
    setStatus({ text: '', taken: false })
    const e = {}
    if (register && !name.trim()) e.name = 'Enter your name.'
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address.'
    if (register ? password.length < 12 : password.length < 8) e.password = register ? 'Password must be at least 12 characters.' : 'Password must be at least 8 characters.'
    setErrors(e)
    if (Object.keys(e).length) return setShake((n) => n + 1)
    setLoading(true)
    try {
      const res = await fetch(register ? '/api/web/auth/register' : '/api/web/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify(register ? { name: name.trim(), email: email.trim(), password, website } : { email: email.trim(), password }),
      })
      if (res.ok) { await onSuccess({ mode }); return }
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) fail('An account with this email already exists.', true)
      else if (res.status === 401) fail('Incorrect email or password.')
      else if (res.status === 400) fail(data.message || (register ? 'Please check your details.' : 'Incorrect email or password.'))
      else if (res.status === 429) {
        const mins = Math.max(1, Math.ceil((Number(data.retryAfter) || 0) / 60))
        fail(`Too many attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`)
      } else fail('This is temporarily unavailable. Please try again in a moment.')
    } catch {
      fail('Cannot reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate key={shake} className={shake ? 'af af--shake' : 'af'}>
      {register && (
        <div className={`lf ${errors.name ? 'has-err' : ''}`}>
          <label htmlFor={`${idp}-name`} className="mono">Name</label>
          <input id={`${idp}-name`} autoFocus={autoFocus} autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-invalid={!!errors.name} />
          {errors.name && <span className="lf__err" role="alert">{errors.name}</span>}
        </div>
      )}
      <div className={`lf ${errors.email ? 'has-err' : ''}`}>
        <label htmlFor={`${idp}-email`} className="mono">Email</label>
        <input id={`${idp}-email`} type="email" inputMode="email" autoFocus={autoFocus && !register} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={!!errors.email} />
        {errors.email && <span className="lf__err" role="alert">{errors.email}</span>}
      </div>
      <div className={`lf ${errors.password ? 'has-err' : ''}`}>
        <label htmlFor={`${idp}-password`} className="mono">Password</label>
        <div className="lf__row">
          <input id={`${idp}-password`} type={show ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" aria-invalid={!!errors.password} />
          <button type="button" className="lf__toggle mono" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
        </div>
        {errors.password && <span className="lf__err" role="alert">{errors.password}</span>}
        {register && <PasswordMeter value={password} />}
        {!register && <a className="lm__link lm__forgot" href="/reset/">Forgot password?</a>}
      </div>
      {register && (
        <div className="hp" aria-hidden="true">
          <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
        </div>
      )}
      <div className="lm__status" role="status" aria-live="polite">
        {status.text}
        {status.taken && <> <button type="button" className="lm__link" onClick={() => onMode('login')}>Sign in instead</button></>}
      </div>
      <button className="lm__go" type="submit" disabled={loading}>
        {loading ? <span className="lm__spin" aria-label="Please wait" /> : <>{register ? 'Create account' : 'Sign in'} <span aria-hidden="true">→</span></>}
      </button>
      {!register && passkeysSupported() && (
        <button type="button" className="lm__pk" onClick={usePasskey} disabled={loading}>Sign in with a passkey</button>
      )}
      <p className="lm__foot mono">
        {register ? (<>Already have an account? <button type="button" className="lm__link" onClick={() => onMode('login')}>Sign in</button></>) : (<>No account yet? <button type="button" className="lm__link" onClick={() => onMode('register')}>Create one</button></>)}
      </p>
    </form>
  )
}
