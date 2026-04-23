import { Link } from 'react-router-dom'
import { Trash2, Settings, LogOut, Database, Rocket, Users } from 'lucide-react'
import { useChatStore } from '@/store/useChatStore'
import { useAuth } from '@/hooks/useAuth'
import { HeartbeatLight } from '@/components/HeartbeatLight'
import { StatusPill } from '@/components/StatusPill'

export function Header() {
  const { clearMessages, setSettingsOpen } = useChatStore()
  const { profile, signOut } = useAuth()
  const isSuperadmin = profile?.role === 'superadmin'

  return (
    <header className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface flex-shrink-0 gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="text-xl font-extrabold tracking-tight text-accent shrink-0">
          🦞 <span className="text-muted font-normal">openclaw</span>
        </div>
        <StatusPill />
        <HeartbeatLight />
      </div>

      <div className="flex gap-2 items-center flex-wrap justify-end">
        {isSuperadmin && (
          <>
            <Link
              to="/db-connection"
              title="DB-Connection"
              className="bg-surface2 border border-border text-muted px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 text-xs font-semibold transition-all duration-150 hover:border-accent hover:text-accent"
            >
              <Database size={14} />
              <span className="hidden sm:inline">DB</span>
            </Link>
            <Link
              to="/deploy-bot"
              title="Deploy bot"
              className="bg-surface2 border border-border text-muted px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 text-xs font-semibold transition-all duration-150 hover:border-accent hover:text-accent"
            >
              <Rocket size={14} />
              <span className="hidden sm:inline">Deploy</span>
            </Link>
            <Link
              to="/admin/users"
              title="Users"
              className="bg-surface2 border border-border text-muted px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 text-xs font-semibold transition-all duration-150 hover:border-accent hover:text-accent"
            >
              <Users size={14} />
              <span className="hidden sm:inline">Users</span>
            </Link>
          </>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          title="Sign out"
          className="bg-surface2 border border-border text-muted w-[34px] h-[34px] rounded-lg cursor-pointer flex items-center justify-center transition-all duration-150 hover:border-accent hover:text-accent"
        >
          <LogOut size={15} />
        </button>
        <button
          type="button"
          onClick={clearMessages}
          title="Clear chat"
          className="bg-surface2 border border-border text-muted w-[34px] h-[34px] rounded-lg cursor-pointer flex items-center justify-center transition-all duration-150 hover:border-accent hover:text-accent"
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="bg-surface2 border border-border text-muted w-[34px] h-[34px] rounded-lg cursor-pointer flex items-center justify-center transition-all duration-150 hover:border-accent hover:text-accent"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
