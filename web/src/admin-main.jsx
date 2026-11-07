import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './admin.css'
import Admin from './Admin.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Admin />
    </AuthProvider>
  </StrictMode>,
)
