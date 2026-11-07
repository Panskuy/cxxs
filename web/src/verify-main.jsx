import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './account.css'
import Verify from './Verify.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Verify />
    </AuthProvider>
  </StrictMode>,
)
