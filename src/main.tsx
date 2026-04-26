import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthProvider'
import { router } from '@/router'
import './index.css'

// StrictMode off: dev double-mount ran effect cleanup and closed the WS while CONNECTING.
createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <RouterProvider router={router} />
  </AuthProvider>,
)
