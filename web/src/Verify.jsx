import { useEffect, useRef, useState } from 'react'
import { useAuth } from './auth'
import Layout from './Layout'
import { CheckIcon, MailIcon, CloseIcon } from './icons'

// The link is /verify/#<token>. The token is in the fragment so it never reaches server logs or Referer headers.
export default function Verify() {
  const { refresh } = useAuth()
  const [state, setState] = useState('working') // working | ok | bad | net
  const [email, setEmail] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice; a token works only once
    started.current = true
    const token = location.hash.slice(1)
    history.replaceState(null, '', location.pathname)
    if (!token) { setState('bad'); return }
    fetch('/api/web/auth/verify-email', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        if (r.ok) { setEmail((await r.json()).email); setState('ok'); refresh() } else setState('bad')
      })
      .catch(() => setState('net'))
  }, [refresh])

  return (
    <Layout banner={false}><div className="ac-gate">
      <div className="ac-gate__card" role="status" aria-live="polite">
        <span className="lm__ic">{state === 'ok' ? <CheckIcon /> : state === 'working' ? <MailIcon /> : <CloseIcon />}</span>
        {state === 'working' && <><h1>Confirming your email…</h1><p>One moment.</p></>}
        {state === 'ok' && <><h1>Email confirmed</h1><p>{email} is verified. You can now change your email from your account.</p></>}
        {state === 'bad' && <><h1>This link did not work</h1><p>It may have expired, been used already, or belong to an old address. Sign in and request a new link from your account.</p></>}
        {state === 'net' && <><h1>Cannot reach the server</h1><p>Check your connection and open the link again.</p></>}
        <div className="ac-row ac-row--c">
          <a className="ac-btn ac-btn--p" href="/account/">Go to account</a>
          <a className="ac-btn" href="/">Home</a>
        </div>
      </div>
    </div></Layout>
  )
}
