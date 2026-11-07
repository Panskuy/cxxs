import { useState } from 'react'
import Layout from './Layout'
import AuthForm from './AuthForm'
import { Brand } from './Layout'
import './ui.css'
import './login.css'

// Only allow redirects to paths on this site, never to another origin.
function safeNext() {
  const n = new URLSearchParams(window.location.search).get('next') || '/'
  return n.startsWith('/') && !n.startsWith('//') ? n : '/'
}

export default function Login() {
  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login')
  const [done, setDone] = useState(false)
  const register = mode === 'register'
  const onSuccess = async () => {
    setDone(true)
    setTimeout(() => (window.location.href = safeNext()), 500)
  }
  return (
    <Layout banner={false}>
      <div className="lp">
        <div className="lp__card">
          <Brand />
          <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
          <p>{done ? 'All set. Redirecting…' : register ? 'Free, and you can download right away.' : 'Sign in to download products and manage your account.'}</p>
          <AuthForm mode={mode} onMode={setMode} onSuccess={onSuccess} idp="lp" />
        </div>
      </div>
    </Layout>
  )
}
