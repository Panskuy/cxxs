import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './account.css'
import AccountPage from './AccountPage.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AccountPage />
    </AuthProvider>
  </StrictMode>,
)
