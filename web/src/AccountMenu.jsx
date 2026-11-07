import { useCallback, useEffect, useRef, useState } from 'react'
import { api, SSO } from './auth'
import { PhoneIcon, TabletIcon, LaptopIcon, UnknownDeviceIcon } from './icons'

const ICON = { mobile: PhoneIcon, tablet: TabletIcon, desktop: LaptopIcon, unknown: UnknownDeviceIcon }
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

export default function AccountMenu({ me }) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState([])
  const [busy, setBusy] = useState(false)
  const box = useRef(null)

  const load = useCallback(async () => {
    const r = await api('sessions')
    if (r.ok) setSessions((await r.json()).sessions)
  }, [])

  useEffect(() => {
    if (!open) return
    load()
    const out = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc) }
  }, [open, load])

  const logout = async () => {
    setBusy(true)
    try { await api('logout', { method: 'POST', body: '{}' }) } finally { window.location.replace(SSO ? '/' : '/login/') }
  }
  const revoke = async (id) => { await api(`sessions/${id}`, { method: 'DELETE' }); load() }
  const revokeOthers = async () => { await api('logout-others', { method: 'POST', body: '{}' }); load() }

  const { user, session } = me
  return (
    <div className="acct" ref={box}>
      <button className="acct__btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" aria-label="Account">
        {(user.name || user.email)[0].toUpperCase()}
      </button>
      {open && (
        <div className="acct__panel" role="menu">
          <p className="acct__email">{user.name || user.email}</p>
          {user.name && <p className="acct__mail mono">{user.email}</p>}
          <p className="mono acct__meta">{user.role} · this device: {session.client === 'MOBILE' ? 'Mobile app' : 'Web'} · {session.label}</p>
          <h3 className="mono acct__h">Where you're signed in</h3>
          <ul className="sess">
            {sessions.map((s) => (
              <li key={s.id} className={s.current ? 'is-current' : ''}>
                <span className="sess__ic" aria-hidden="true">{(() => { const Dev = ICON[s.device] ?? ICON.unknown; return <Dev /> })()}</span>
                <div className="sess__tx">
                  <b>{s.client === 'MOBILE' ? 'Mobile app' : 'Web'} · {s.label}</b>
                  <span className="mono">{s.ip} · {s.current ? 'this device' : ago(s.lastSeenAt)}</span>
                </div>
                {!s.current && <button className="sess__x mono" onClick={() => revoke(s.id)}>Sign out</button>}
              </li>
            ))}
          </ul>
          {sessions.length > 1 && <button className="sess__others mono" onClick={revokeOthers}>Sign out all other devices</button>}
          <a className="acct__manage" href="/account/">Manage account <i aria-hidden="true">↗</i></a>
          <button className="acct__out" onClick={logout} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
        </div>
      )}
    </div>
  )
}
