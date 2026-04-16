import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedLayout } from '@/layouts/ProtectedLayout'
import { MainLayout } from '@/layouts/MainLayout'
import { SuperadminGate } from '@/components/SuperadminGate'
import { ChatPage } from '@/pages/ChatPage'
import { LoginPage } from '@/pages/LoginPage'
import { DbConnectionPage } from '@/pages/DbConnectionPage'
import { DeployBotPage } from '@/pages/DeployBotPage'
import { AdminSessionsPage } from '@/pages/AdminSessionsPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { index: true, element: <ChatPage /> },
          { path: 'chat', element: <ChatPage /> },
          {
            path: 'db-connection',
            element: (
              <SuperadminGate>
                <DbConnectionPage />
              </SuperadminGate>
            ),
          },
          {
            path: 'deploy-bot',
            element: (
              <SuperadminGate>
                <DeployBotPage />
              </SuperadminGate>
            ),
          },
          {
            path: 'admin/sessions',
            element: (
              <SuperadminGate>
                <AdminSessionsPage />
              </SuperadminGate>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
