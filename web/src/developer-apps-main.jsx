import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import DeveloperApps from './DeveloperApps.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <DeveloperApps />
    </AuthProvider>
  </StrictMode>,
)
