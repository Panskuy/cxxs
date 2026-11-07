import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import NotFound from './NotFound.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <NotFound />
    </AuthProvider>
  </StrictMode>,
)
