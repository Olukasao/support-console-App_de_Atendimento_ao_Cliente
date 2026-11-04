import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AppNavRail } from './AppNavRail'

interface PageShellProps {
  active: string
  title: string
  subtitle?: string
  headerExtra?: ReactNode
  children: ReactNode
}

export function PageShell({ active, title, subtitle, headerExtra, children }: PageShellProps) {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <div className="app-frame">
      <AppNavRail active={active} role={user?.role} onNavigate={(path) => navigate(path)} />
      <main className="app-shell">
        <header className="page-shell-header">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {headerExtra && <div className="page-shell-header-extra">{headerExtra}</div>}
        </header>
        <div className="page-shell-content">{children}</div>
      </main>
    </div>
  )
}
