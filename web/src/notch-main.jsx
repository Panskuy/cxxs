import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Product from './Product.jsx'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Product />
    </AuthProvider>
  </StrictMode>,
)
