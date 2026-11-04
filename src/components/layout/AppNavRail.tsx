import {
  BarChart3,
  CheckCheck,
  ClipboardList,
  Headset,
  Moon,
  Send,
  Sun,
  Wallet,
  Workflow,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { canManageCampaigns, canViewAutomations, canViewMonitoring, canViewSalesAudit } from '../../utils/security'

interface NavRailItem {
  id: string
  label: string
  path: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  visible(role?: string): boolean
}

const NAV_ITEMS: NavRailItem[] = [
  { id: 'atendimento', label: 'Atendimento', path: '/atendimento', icon: Headset, visible: () => true },
  {
    id: 'monitoramento',
    label: 'Monitoramento',
    path: '/monitoramento',
    icon: BarChart3,
    visible: canViewMonitoring,
  },
  { id: 'vendas', label: 'Vendas', path: '/vendas', icon: Wallet, visible: () => true },
  {
    id: 'auditoria-ticket',
    label: 'Auditoria de tickets',
    path: '/auditoria/tickets',
    icon: ClipboardList,
    visible: canViewMonitoring,
  },
  {
    id: 'auditoria-vendas',
    label: 'Auditoria de vendas',
    path: '/auditoria/vendas',
    icon: Wallet,
    visible: canViewSalesAudit,
  },
  { id: 'finalizados', label: 'Finalizados', path: '/finalizados', icon: CheckCheck, visible: () => true },
  { id: 'disparos', label: 'Disparos', path: '/disparos', icon: Send, visible: canManageCampaigns },
  { id: 'automacoes', label: 'Automações', path: '/automacoes', icon: Workflow, visible: canViewAutomations },
]

interface AppNavRailProps {
  active: string
  role?: string
  onNavigate(path: string): void
}

export function AppNavRail({ active, role, onNavigate }: AppNavRailProps) {
  const { theme, toggleTheme } = useTheme()
  const items = NAV_ITEMS.filter((item) => item.visible(role))

  return (
    <nav className="nav-rail" aria-label="Módulos">
      <span className="nav-rail-brand" aria-hidden="true">
        AN
      </span>

      <div className="nav-rail-items">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-rail-item ${active === item.id ? 'active' : ''}`}
              title={item.label}
              aria-label={item.label}
              aria-current={active === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.path)}
            >
              <Icon size={19} aria-hidden />
            </button>
          )
        })}
      </div>

      <div className="nav-rail-bottom">
        <button
          type="button"
          className="nav-rail-item"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        >
          {theme === 'dark' ? <Sun size={19} aria-hidden /> : <Moon size={19} aria-hidden />}
        </button>
      </div>
    </nav>
  )
}
