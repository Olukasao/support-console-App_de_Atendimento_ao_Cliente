import { RefreshCw, ShieldCheck, UsersRound } from 'lucide-react'
import type { AgentOption, AgentRole, AttendanceStatus } from '../../types/domain'
import {
  attendanceStatusOptions,
  getAgentRoleLabel,
  getAttendanceStatusIndicator,
  getAttendanceStatusLabel,
  formatInvisibleDuration,
  manageableRoleOptions,
} from '../../utils/agents'

interface TeamMembersPanelProps {
  members: AgentOption[]
  currentUserId: string
  now: number
  loading: boolean
  error: string
  updatingStatusId: string | null
  updatingRoleId: string | null
  onRetry(): void
  onStatusChange(userId: string, status: AttendanceStatus): void
  onRoleChange(userId: string, role: AgentRole): void
}

function getRoleOptions(role: AgentRole): Array<{ id: AgentRole; label: string }> {
  if (manageableRoleOptions.some((option) => option.id === role)) return manageableRoleOptions

  return [
    ...manageableRoleOptions,
    {
      id: role,
      label: getAgentRoleLabel(role),
    },
  ]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? 'A'
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]
  return `${first}${second ?? ''}`.toUpperCase()
}

export function TeamMembersPanel({
  members,
  currentUserId,
  now,
  loading,
  error,
  updatingStatusId,
  updatingRoleId,
  onRetry,
  onStatusChange,
  onRoleChange,
}: TeamMembersPanelProps) {
  const availableCount = members.filter((member) => member.attendanceStatus === 'AVAILABLE').length
  const invisibleCount = members.filter((member) => member.attendanceStatus === 'INVISIBLE').length
  const offlineCount = members.filter((member) => member.online === false).length

  return (
    <section className="team-panel" aria-label="Membros e equipe">
      <div className="team-heading">
        <div className="section-title">
          <UsersRound size={17} aria-hidden="true" />
          <h3>Membros / Equipe</h3>
        </div>
        {!loading && !error && (
          <div className="team-summary" aria-label="Resumo da equipe">
            <span>{availableCount} disponíveis</span>
            <span>{invisibleCount} invisíveis</span>
            <span>{offlineCount} offline</span>
          </div>
        )}
      </div>

      {loading && (
        <div className="team-state" role="status">
          <RefreshCw size={16} aria-hidden="true" className="spin-icon" />
          Carregando equipe...
        </div>
      )}

      {!loading && error && (
        <div className="team-state error">
          <p>{error}</p>
          <button type="button" className="secondary-action" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && members.length === 0 && (
        <div className="team-state">
          Nenhum membro encontrado.
        </div>
      )}

      {!loading && !error && members.length > 0 && (
        <div className="team-member-list">
          {members.map((member) => {
            const status = member.attendanceStatus ?? 'AVAILABLE'
            const isCurrentUser = member.id === currentUserId
            const statusUpdating = updatingStatusId === member.id
            const roleUpdating = updatingRoleId === member.id
            const invisibleDuration = status === 'INVISIBLE'
              ? formatInvisibleDuration(member.attendanceStatusChangedAt, now)
              : ''

            return (
              <article className="team-member-card" key={member.id}>
                <div className="member-avatar" aria-hidden="true">
                  {getInitials(member.name)}
                </div>
                <div className="member-main">
                  <div className="member-topline">
                    <strong>{member.name}</strong>
                    <span className={`role-badge role-${member.role}`}>
                      {getAgentRoleLabel(member.role)}
                    </span>
                  </div>
                  <span className="member-email">{member.email}</span>
                  <span className={`member-presence ${status.toLowerCase()}`}>
                    {getAttendanceStatusIndicator(status)}
                    {getAttendanceStatusLabel(status)}
                    {invisibleDuration ? ` • ${invisibleDuration}` : ''}
                  </span>
                  <div className="member-controls">
                    <label>
                      <span>Cargo</span>
                      <select
                        className="table-select"
                        value={member.role}
                        disabled={roleUpdating || isCurrentUser}
                        aria-label={`Cargo de ${member.name}`}
                        onChange={(event) => onRoleChange(member.id, event.target.value as AgentRole)}
                      >
                        {getRoleOptions(member.role).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Status</span>
                      <select
                        className={`table-select status-${status.toLowerCase()}`}
                        value={status}
                        disabled={statusUpdating}
                        aria-label={`Status de ${member.name}`}
                        onChange={(event) =>
                          onStatusChange(member.id, event.target.value as AttendanceStatus)
                        }
                      >
                        {attendanceStatusOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {getAttendanceStatusIndicator(option.id)} {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {(statusUpdating || roleUpdating) && (
                    <span className="team-action-state">
                      <ShieldCheck size={14} aria-hidden="true" />
                      Salvando...
                    </span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
