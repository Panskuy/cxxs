import { useEffect, useRef, useState } from 'react'
import { CloseIcon, LockIcon, UserIcon } from './icons'
import AuthForm from './AuthForm'

/** The sign-in / sign-up popup. Same API and rules as the sign-in page, without leaving the current page. */
export default function LoginModal({ title, text, mode: initialMode = 'login', onClose, onSuccess }) {
  const card = useRef(null)
  const [mode, setMode] = useState(initialMode)
  const register = mode === 'register'

  // Lock page scroll, return focus on close, close on Esc, keep Tab inside the popup.
  useEffect(() => {
    const opener = document.activeElement
    document.documentElement.classList.add('lm-open')
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const f = [...card.current.querySelectorAll('button, input, a[href]')].filter((n) => !n.disabled && n.tabIndex !== -1)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.documentElement.classList.remove('lm-open')
      document.removeEventListener('keydown', key)
      opener?.focus?.()
    }
  }, [onClose])

  return (
    <div className="lm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lm__card" ref={card} role="dialog" aria-modal="true" aria-labelledby="lm-title">
        <button className="lm__x" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        <span className="lm__ic">{register ? <UserIcon /> : <LockIcon />}</span>
        <h2 id="lm-title">{register ? 'Create your account' : title}</h2>
        <p className="lm__text">{register ? 'It is free, and you can download right away.' : text}</p>
        <AuthForm mode={mode} onMode={setMode} onSuccess={onSuccess} idp="lm" />
      </div>
    </div>
  )
}
