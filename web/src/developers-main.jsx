import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Developers from './Developers.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Developers />
    </AuthProvider>
  </StrictMode>,
)
