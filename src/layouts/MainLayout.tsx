import { Outlet } from 'react-router-dom'
import { Header } from '@/components/Header'

export function MainLayout() {
  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-base text-content font-sans">
      <Header />
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
