import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Catalog from './Catalog.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Catalog />
    </AuthProvider>
  </StrictMode>,
)
