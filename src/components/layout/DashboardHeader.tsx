import {
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleOff,
  Keyboard,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Search,
  UsersRound,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import type { AgentOption, AgentUser, AttendanceStatus, ConversationCounts } from '../../types/domain'
import type { SocketConnectionState } from '../../services/socket/socketTypes'
import {
  attendanceStatusOptions,
  getAgentRoleLabel,
  getAttendanceStatusLabel,
} from '../../utils/agents'

interface DashboardHeaderProps {
  user: AgentUser
  counts: ConversationCounts | null
  connectedAgents: AgentOption[]
  connectionState: SocketConnectionState
  soundEnabled: boolean
  notificationPermission: NotificationPermission
  attendanceStatusUpdating: boolean
  canManageQuickReplies: boolean
  canManageMacros: boolean
  onAttendanceStatusChange(status: AttendanceStatus): void
  onToggleSound(): void
  onRequestNotifications(): void
  onOpenSearch(): void
  onOpenShortcuts(): void
  onOpenQuickReplies(): void
  onOpenMacrosAdmin(): void
  onLogout(): void
}

function getConnectionLabel(state: SocketConnectionState): string {
  if (state === 'connected') return 'Online'
  if (state === 'connecting') return 'Conectando...'
  if (state === 'reconnecting') return 'Reconectando...'
  return 'Desconectado'
}

export function DashboardHeader({
  user,
  counts,
  connectedAgents,
  connectionState,
  soundEnabled,
  notificationPermission,
  attendanceStatusUpdating,
  canManageQuickReplies,
  canManageMacros,
  onAttendanceStatusChange,
  onToggleSound,
  onRequestNotifications,
  onOpenSearch,
  onOpenShortcuts,
  onOpenQuickReplies,
  onOpenMacrosAdmin,
  onLogout,
}: DashboardHeaderProps) {
  const visibleConnectedAgents = connectedAgents.slice(0, 3)
  const attendanceStatus = user.attendanceStatus ?? 'AVAILABLE'
  const stats = counts
    ? [
        ['Novos', counts.new],
        ['Meus', counts.mine],
        ['Aguardando', counts.waiting_customer],
        ['Arquivados', counts.archived],
      ]
    : []

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? 'A'
    const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]
    return `${first}${second ?? ''}`.toUpperCase()
  }

  return (
    <header className="dashboard-header">
      <div className="header-breadcrumb">
        <ChevronRight size={16} aria-hidden="true" />
        <h1>Atendimento</h1>
      </div>

      {counts && (
        <dl className="header-metrics" aria-label="Indicadores do atendimento">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          {counts.today !== undefined && (
            <div>
              <dt>Hoje</dt>
              <dd>{counts.today}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="agent-toolbar">
        <button
          className="icon-button"
          type="button"
          onClick={onOpenSearch}
          aria-label="Busca rápida (Ctrl+K)"
          title="Busca rápida (Ctrl+K)"
        >
          <Search size={18} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onOpenShortcuts}
          aria-label="Atalhos de teclado"
          title="Atalhos de teclado"
        >
          <Keyboard size={18} aria-hidden="true" />
        </button>
        <details className="connected-agents">
          <summary aria-label={`${connectedAgents.length} atendentes online`}>
            <span className="avatar-stack" aria-hidden="true">
              {visibleConnectedAgents.map((agent) => (
                <span className="mini-avatar" key={agent.id}>
                  {getInitials(agent.name)}
                </span>
              ))}
              {visibleConnectedAgents.length === 0 && (
                <span className="mini-avatar empty">
                  <UsersRound size={14} aria-hidden="true" />
                </span>
              )}
            </span>
            <span className="connected-summary">
              <strong>{connectedAgents.length}</strong>
              online
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="connected-popover">
            <header>
              <strong>Atendentes online</strong>
              <span>{connectedAgents.length}</span>
            </header>
            {connectedAgents.length > 0 ? (
              <div className="connected-list">
                {connectedAgents.map((agent) => (
                  <div className="connected-row" key={agent.id}>
                    <span className="mini-avatar">{getInitials(agent.name)}</span>
                    <span>
                      <strong>{agent.name}</strong>
                      <small>{getAgentRoleLabel(agent.role)}</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p>Nenhum atendente online</p>
            )}
          </div>
        </details>
        <span className={`connection-pill ${connectionState}`}>
          <RefreshCw size={14} aria-hidden="true" />
          {getConnectionLabel(connectionState)}
        </span>
        <button
          className="icon-button"
          type="button"
          onClick={onToggleSound}
          aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
          title={soundEnabled ? 'Desativar som' : 'Ativar som'}
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onRequestNotifications}
          disabled={notificationPermission === 'granted'}
          aria-label="Ativar notificações"
          title="Ativar notificações"
        >
          {notificationPermission === 'granted' ? <Bell size={18} /> : <BellOff size={18} />}
        </button>
        <label className={`attendance-status-control ${attendanceStatus.toLowerCase()}`}>
          <span className="status-control-label">
            {attendanceStatus === 'INVISIBLE'
              ? <CircleOff size={15} aria-hidden="true" />
              : <Circle size={15} aria-hidden="true" />}
            Atendimento
          </span>
          <select
            value={attendanceStatus}
            disabled={attendanceStatusUpdating}
            onChange={(event) => onAttendanceStatusChange(event.target.value as AttendanceStatus)}
            aria-label="Status de atendimento"
            title={getAttendanceStatusLabel(attendanceStatus)}
          >
            {attendanceStatusOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <details className="agent-profile">
          <summary aria-label="Abrir menu do perfil">
            <span className="user-avatar">{getInitials(user.name || user.email)}</span>
            <span className="agent-identity">
              <strong>{user.name}</strong>
              <span>{getAgentRoleLabel(user.role)}</span>
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="profile-menu">
            <div className="profile-card">
              <span className="user-avatar">{getInitials(user.name || user.email)}</span>
              <span>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </span>
            </div>
            {canManageQuickReplies && (
              <button type="button" onClick={onOpenQuickReplies}>
                <MessageSquareText size={16} aria-hidden="true" />
                Respostas rápidas
              </button>
            )}
            {canManageMacros && (
              <button type="button" onClick={onOpenMacrosAdmin}>
                <Zap size={16} aria-hidden="true" />
                Macros
              </button>
            )}
            <button type="button" onClick={onLogout}>
              <LogOut size={16} aria-hidden="true" />
              Sair
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}
