import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './ui.css'
import './login.css'
import Reset from './Reset.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Reset />
    </AuthProvider>
  </StrictMode>,
)
