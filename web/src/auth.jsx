import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import LoginModal from './LoginModal'
import VerifyModal from './VerifyModal'
import { LockIcon } from './icons'
import './ui.css'

const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }
export const api = (path, opts = {}) => fetch(`/api/web/auth/${path}`, { credentials: 'include', headers: HEADERS, ...opts })

// On developer.<domain> people do not type their password: they sign in on the main site and come back (SSO, see api/src/sso.ts).
export const SSO = typeof location !== 'undefined' && location.hostname.startsWith('developer.')
export const loginHref = SSO ? '/api/sso/start' : '/login/'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

/**
 * Who is signed in, a sign-in popup that any page can open, and downloads that need a session.
 * Pages are public; only the download itself asks for a login, and the server enforces it.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading') // loading | anon | user
  const [me, setMe] = useState(null)
  const [login, setLogin] = useState(null) // null = closed, else { title, text, after }
  const [verify, setVerify] = useState(null) // null = closed, else { after }
  const [busy, setBusy] = useState(null)
  const meRef = useRef(null)
  const [notice, setNotice] = useState(null)
  const statusRef = useRef('loading')
  const noticeTimer = useRef(0)

  // Keep the ref in step immediately: a download started right after sign-in must already see 'user',
  // not wait for the next render.
  const setAuth = useCallback((next, who = null) => {
    statusRef.current = next
    meRef.current = who
    setStatus(next)
    setMe(who)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const r = await api('me')
      if (r.ok) setAuth('user', await r.json())
      else setAuth('anon')
    } catch { setAuth('anon') }
  }, [setAuth])

  useEffect(() => { refresh() }, [refresh])

  const say = useCallback((text, kind = 'ok') => {
    clearTimeout(noticeTimer.current)
    setNotice({ text, kind })
    noticeTimer.current = setTimeout(() => setNotice(null), 4200)
  }, [])

  const openLogin = useCallback((opts = {}) => {
    if (SSO) { window.location.href = loginHref; return }
    setLogin({ title: 'Sign in', text: 'Sign in to continue.', mode: 'login', ...opts })
  }, [])
  const closeLogin = useCallback(() => setLogin(null), [])

  const logout = useCallback(async () => {
    try { await api('logout', { method: 'POST', body: '{}' }) } catch { /* the server forgets the session either way */ }
    setAuth('anon')
  }, [setAuth])

  const download = useCallback(async (slug) => {
    if (statusRef.current !== 'user') {
      openLogin({ title: 'Sign in to download', text: 'Downloads are for signed-in users. Sign in and your download starts right away.', after: () => download(slug) })
      return
    }
    if (meRef.current && meRef.current.user.emailVerified === false) {
      setVerify({ after: () => download(slug) })
      return
    }
    setBusy(slug)
    try {
      const r = await fetch(`/api/web/downloads/${slug}`, { credentials: 'include', headers: { 'X-Requested-With': 'fetch' } })
      if (r.status === 401) {
        setAuth('anon')
        openLogin({ title: 'Session expired', text: 'Please sign in again to download.', after: () => download(slug) })
        return
      }
      if (r.status === 403) {
        await refresh()
        setVerify({ after: () => download(slug) })
        return
      }
      if (r.status === 429) { say('Too many downloads for now. Please try again later.', 'err'); return }
      if (!r.ok) throw new Error(String(r.status))
      const blob = await r.blob()
      const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] ?? `${slug}.zip`
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: name })
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 15000)
      say('Download started.')
      window.dispatchEvent(new Event('stats:refresh'))
    } catch {
      say('Download failed. Please try again.', 'err')
    } finally {
      setBusy(null)
    }
  }, [openLogin, say, setAuth, refresh])

  const value = useMemo(
    () => ({ status, me, busy, loginOpen: !!login, openLogin, closeLogin, refresh, logout, download, say }),
    [status, me, busy, login, openLogin, closeLogin, refresh, logout, download, say],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {login && (
        <LoginModal
          {...login}
          onClose={closeLogin}
          onSuccess={async () => { await refresh(); const after = login.after; closeLogin(); after?.() }}
        />
      )}
      {verify && (
        <VerifyModal
          email={me?.user.email}
          onClose={() => setVerify(null)}
          onVerified={() => { const after = verify.after; setVerify(null); after?.() }}
          refresh={refresh}
          getVerified={() => meRef.current?.user.emailVerified === true}
        />
      )}
      {notice && <div className={`toast mono ${notice.kind}`} role="status" aria-live="polite">{notice.text}</div>}
    </Ctx.Provider>
  )
}

/** A download button: asks for a sign-in popup first when nobody is signed in. */
export function DownloadButton({ slug, label = 'Download', sub, variant = 'primary', className = '' }) {
  const { status, busy, download } = useAuth()
  const anon = status === 'anon'
  const text = busy === slug ? 'Preparing…' : anon ? 'Sign in to download' : label
  if (variant === 'nav') {
    return (
      <button className={`nt-dl ${className}`} onClick={() => download(slug)} disabled={status === 'loading' || busy === slug}>
        {anon && <LockIcon className="ic--btn" />}{anon ? 'Sign in to download' : label}
      </button>
    )
  }
  return (
    <button className={`btn-p ${variant === 'large' ? 'btn-p--lg' : ''} ${className}`} onClick={() => download(slug)} disabled={status === 'loading' || busy === slug}>
      <span className="btn-p__t">{anon && <LockIcon className="ic--btn" />}{text}</span>
      {sub && <small className="mono">{sub}</small>}
    </button>
  )
}
