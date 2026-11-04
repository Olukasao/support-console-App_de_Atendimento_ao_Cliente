import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Clock,
  CornerDownLeft,
  Edit3,
  Headset,
  Inbox,
  ListFilter,
  Mail,
  Menu,
  MessageCircle,
  MessageSquareText,
  MoreVertical,
  PanelLeft,
  Phone,
  Search,
  Send,
  Shield,
  SlidersHorizontal,
  UserRound,
  Volume2,
  Wallet,
  Workflow,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChatPanel } from '../components/chat/ChatPanel'
import { CloseConversationDialog } from '../components/chat/CloseConversationDialog'
import { QuickRepliesAdminDialog } from '../components/chat/QuickRepliesAdminDialog'
import { TransferDialog } from '../components/chat/TransferDialog'
import { MacroAdminDialog } from '../components/macros/MacroAdminDialog'
import { MacroExecutionModal } from '../components/macros/MacroExecutionModal'
import { MacroExecutionProgress } from '../components/macros/MacroExecutionProgress'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { GlobalSearch } from '../components/shared/GlobalSearch'
import { KeyboardShortcutsHelp } from '../components/shared/KeyboardShortcutsHelp'
import { useAuth } from '../hooks/useAuth'
import { useMacros } from '../hooks/useMacros'
import { useMacroExecution, type MacroActionRunner } from '../hooks/useMacroExecution'
import { useNotifier } from '../hooks/useNotifier'
import { useTheme } from '../hooks/useTheme'
import { agentsApi } from '../services/api/agentsApi'
import { conversationsApi } from '../services/api/conversationsApi'
import { UnauthorizedError } from '../services/api/httpClient'
import { quickRepliesApi } from '../services/api/quickRepliesApi'
import { chatSocket } from '../services/socket/socketService'
import type { SocketConnectionState } from '../services/socket/socketTypes'
import type { Macro } from '../types/macro'
import type {
  AgentOption,
  AgentUser,
  AttendanceStatus,
  ConversationCloseReason,
  ConversationCounts,
  ConversationDetail,
  ConversationFilter,
  ConversationNote,
  ConversationQueueSort,
  ConversationStatus,
  ConversationSummary,
  ConversationTag,
  ConversationTagFilter,
  Message,
  QuickReply,
} from '../types/domain'
import { applyConversationQueueView } from '../utils/conversationQueue'
import { getAttendanceStatusHelper } from '../utils/agents'
import { getReadableError } from '../utils/errors'
import { canCloseConversation, canManageMacros, canManageMembers, canTransfer } from '../utils/security'
import { createClientMessageId } from '../utils/uuid'

const initialCounts: ConversationCounts = {
  new: 0,
  mine: 0,
  open: 0,
  waiting_customer: 0,
  closed: 0,
  archived: 0,
}

const homeSettingsStorageKey = 'acessanet-atendimento:home-settings'
const ticketPanelStorageKey = 'acessanet-atendimento:ticket-panel-open'
const attendanceSessionStoragePrefix = 'acessanet-atendimento:attendance-session'
const defaultConversationTagFilter: ConversationTagFilter = 'all'
const defaultConversationQueueSort: ConversationQueueSort = 'priority'

interface AttendanceHomeSettings {
  newAttendanceSound: boolean
  newMessageSound: boolean
  floatingWindow: boolean
}

interface AttendanceHomeNavItem {
  id: string
  label: string
  path?: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  expandable?: boolean
  children?: Array<{
    id: string
    label: string
    path?: string
    icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  }>
}

interface AttendanceHomeSidebarProps {
  active: string
  user: AgentUser
  onNavigate(path: string): void
  onUnavailable(): void
  onOpenMacrosAdmin?(): void
}

interface AttendanceHomeTopbarProps {
  active: boolean
  elapsed: string
  theme: 'dark' | 'light'
  waitingTickets: number
  onBack(): void
  onOpenQueue(): void
  onToggleTheme(): void
  onLogout(): void
}

interface AttendanceHomeProps {
  user: AgentUser
  currentTimeLabel: string
  elapsed: string
  waitingTickets: number
  notificationsLabel: string
  theme: 'dark' | 'light'
  active: boolean
  starting: boolean
  settings: AttendanceHomeSettings
  onStart(): void
  onToggleSetting(key: keyof AttendanceHomeSettings): void
  onNavigate(path: string): void
  onOpenQueue(): void
  onToggleTheme(): void
  onUnavailable(): void
  onOpenMacrosAdmin(): void
  onLogout(): void
}

interface AttendanceDeskProps {
  user: AgentUser
  active: boolean
  elapsed: string
  theme: 'dark' | 'light'
  waitingTickets: number
  channelStatusLabel: string
  conversations: ConversationSummary[]
  selectedId?: string
  search: string
  filter: ConversationFilter
  ticketPanelOpen: boolean
  loading: boolean
  error: string
  children: ReactNode
  onSearchChange(value: string): void
  onFilterChange(filter: ConversationFilter): void
  onToggleTicketPanel(): void
  onSelect(conversationId: string): void
  onRetry(): void
  onNavigate(path: string): void
  onEndSession(): void
  onToggleTheme(): void
  onOpenMacrosAdmin(): void
  onLogout(): void
}

const defaultHomeSettings: AttendanceHomeSettings = {
  newAttendanceSound: true,
  newMessageSound: true,
  floatingWindow: true,
}

const homeNavItems: AttendanceHomeNavItem[] = [
  { id: 'atendimento', label: 'Atendimento', path: '/atendimento', icon: Headset },
  {
    id: 'monitoramento',
    label: 'Monitoramento',
    path: '/monitoramento',
    icon: BarChart3,
    expandable: true,
    children: [
      { id: 'operacao', label: 'Operação', path: '/monitoramento', icon: Activity },
      { id: 'guard', label: 'Guard', path: '/monitoramento', icon: Shield },
    ],
  },
  { id: 'auditoria-ticket', label: 'Auditoria de Ticket', path: '/auditoria/tickets', icon: ClipboardList },
  { id: 'auditoria-vendas', label: 'Auditoria de Vendas', path: '/auditoria/vendas', icon: Wallet },
  { id: 'disparos', label: 'Disparos', path: '/disparos', icon: Send },
  { id: 'automacoes', label: 'Automações', path: '/automacoes', icon: Workflow },
  { id: 'configuracoes', label: 'Configurações', icon: SlidersHorizontal, expandable: true },
]

function readHomeSettings(): AttendanceHomeSettings {
  if (typeof window === 'undefined') return defaultHomeSettings

  try {
    const stored = window.localStorage.getItem(homeSettingsStorageKey)
    if (!stored) return defaultHomeSettings

    const parsed = JSON.parse(stored) as Partial<AttendanceHomeSettings>
    return {
      newAttendanceSound:
        typeof parsed.newAttendanceSound === 'boolean'
          ? parsed.newAttendanceSound
          : defaultHomeSettings.newAttendanceSound,
      newMessageSound:
        typeof parsed.newMessageSound === 'boolean'
          ? parsed.newMessageSound
          : defaultHomeSettings.newMessageSound,
      floatingWindow:
        typeof parsed.floatingWindow === 'boolean'
          ? parsed.floatingWindow
          : defaultHomeSettings.floatingWindow,
    }
  } catch {
    return defaultHomeSettings
  }
}

function persistHomeSettings(settings: AttendanceHomeSettings): void {
  window.localStorage.setItem(homeSettingsStorageKey, JSON.stringify(settings))
}

function readTicketPanelOpen(): boolean {
  if (typeof window === 'undefined') return true

  try {
    const stored = window.localStorage.getItem(ticketPanelStorageKey)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

function persistTicketPanelOpen(open: boolean): void {
  try {
    window.localStorage.setItem(ticketPanelStorageKey, String(open))
  } catch {
    // localStorage indisponível (modo privado, etc.) — preferência simplesmente não persiste.
  }
}

function getAttendanceSessionStorageKey(userId: string): string {
  return `${attendanceSessionStoragePrefix}:${userId}`
}

function normalizeStartedAt(value: unknown): number | null {
  const startedAt = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null

  const maxClockSkew = 60_000
  if (startedAt > Date.now() + maxClockSkew) return null

  return startedAt
}

function readAttendanceSession(userId: string): number | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(getAttendanceSessionStorageKey(userId))
    if (!stored) return null

    const parsed = JSON.parse(stored) as { startedAt?: unknown }
    return normalizeStartedAt(parsed.startedAt)
  } catch {
    return null
  }
}

function persistAttendanceSession(userId: string, startedAt: number): void {
  window.localStorage.setItem(
    getAttendanceSessionStorageKey(userId),
    JSON.stringify({ startedAt }),
  )
}

function clearAttendanceSession(userId: string): void {
  window.localStorage.removeItem(getAttendanceSessionStorageKey(userId))
}

function formatClock(value: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function formatElapsedTime(startedAt: number | null, now: number): string {
  if (!startedAt) return '00:00:00'

  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function getFirstName(user: AgentUser): string {
  const name = user.name.trim()
  if (name) return name.split(/\s+/)[0] ?? name

  const emailName = user.email.split('@')[0]?.trim()
  return emailName || 'Lucas'
}

function getInitials(name: string, email: string): string {
  const source = name.trim() || email.trim() || 'Lucas'
  const parts = source.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? 'L'
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]

  return `${first}${second ?? ''}`.toUpperCase()
}

function getNotificationPermissionLabel(permission: NotificationPermission): string {
  if (permission === 'granted') return 'Ativadas'
  if (permission === 'denied') return 'Bloqueadas'

  return 'Serão solicitadas'
}

function AttendanceHomeSidebar({
  active,
  user,
  onNavigate,
  onUnavailable,
  onOpenMacrosAdmin,
}: AttendanceHomeSidebarProps) {
  const initials = getInitials(user.name, user.email)
  const displayName = user.name.trim() || 'Lucas'
  const displayEmail = user.email.trim() || 'lukasao.11@hotmail.com'

  return (
    <aside className="attendance-home-sidebar" aria-label="Navegação principal">
      <div className="attendance-home-brand">
        <span className="attendance-home-brand-mark" aria-hidden="true">
          W
        </span>
        <span>
          <strong>WIT</strong>
          <small>Conta: Acessanet</small>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </div>

      <nav className="attendance-home-nav" aria-label="Módulos">
        {homeNavItems.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id

          return (
            <div className="attendance-home-nav-group" key={item.id}>
              <button
                type="button"
                className={`attendance-home-nav-item ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  if (item.path) {
                    onNavigate(item.path)
                    return
                  }

                  if (item.id === 'configuracoes' && onOpenMacrosAdmin && canManageMacros(user.role)) {
                    onOpenMacrosAdmin()
                    return
                  }

                  onUnavailable()
                }}
              >
                <Icon size={15} aria-hidden />
                <span>{item.label}</span>
                {item.expandable && <ChevronDown size={14} aria-hidden="true" />}
              </button>

              {item.children && (
                <div className="attendance-home-nav-children">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon
                    return (
                      <button
                        key={child.id}
                        type="button"
                        className="attendance-home-nav-child"
                        onClick={() => {
                          if (child.path) {
                            onNavigate(child.path)
                            return
                          }

                          onUnavailable()
                        }}
                      >
                        <ChildIcon size={13} aria-hidden />
                        <span>{child.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="attendance-home-profile">
        <span className="attendance-home-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="attendance-home-profile-copy">
          <strong>{displayName}</strong>
          <small>{displayEmail}</small>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </div>
    </aside>
  )
}

function AttendanceHomeTopbar({
  active,
  elapsed,
  theme,
  waitingTickets,
  onBack,
  onOpenQueue,
  onToggleTheme,
  onLogout,
}: AttendanceHomeTopbarProps) {
  return (
    <header className="attendance-home-topbar">
      <div className="attendance-home-title">
        <button type="button" className="attendance-home-back" aria-label="Voltar" onClick={onBack}>
          <ArrowLeft size={19} aria-hidden="true" />
        </button>
        <span className="attendance-home-title-divider" aria-hidden="true" />
        <h1>Atendimento</h1>
      </div>

      <div className="attendance-home-toolbar">
        <span className={`attendance-home-status ${active ? 'available' : ''}`}>
          <span aria-hidden="true" />
          {active ? 'Disponível' : 'Desconectado'}
        </span>
        <span className="attendance-home-session">
          <UserRound size={16} aria-hidden="true" />
          <strong>{waitingTickets}</strong>
          <span aria-hidden="true" />
          <Clock size={16} aria-hidden="true" />
          <strong>{elapsed}</strong>
        </span>
        <button
          type="button"
          className="attendance-home-icon-button"
          aria-label="Abrir fila de atendimento"
          title="Fila de atendimento"
          onClick={onOpenQueue}
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <button type="button" className="attendance-home-account" aria-label="Conta Acessanet">
          <Building2 size={17} aria-hidden="true" />
          <span>Acessanet</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <details className="attendance-home-more">
          <summary aria-label="Mais opções">
            <MoreVertical size={18} aria-hidden="true" />
          </summary>
          <div className="attendance-home-more-menu">
            <button type="button" onClick={onOpenQueue}>
              Fila de atendimento
            </button>
            <button type="button" onClick={onToggleTheme}>
              {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            </button>
            <button type="button" onClick={onLogout}>
              Sair
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}

function AttendanceHomeToggle({
  checked,
  label,
  onClick,
}: {
  checked: boolean
  label: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={`attendance-home-toggle ${checked ? 'checked' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
    >
      <span aria-hidden="true" />
    </button>
  )
}

function AttendanceHome({
  user,
  currentTimeLabel,
  elapsed,
  waitingTickets,
  notificationsLabel,
  theme,
  active,
  starting,
  settings,
  onStart,
  onToggleSetting,
  onNavigate,
  onOpenQueue,
  onToggleTheme,
  onUnavailable,
  onOpenMacrosAdmin,
  onLogout,
}: AttendanceHomeProps) {
  const firstName = getFirstName(user)
  const buttonLabel = active ? 'Atendimento Iniciado' : 'Iniciar Atendimento'

  return (
    <div className="attendance-home-frame">
      <AttendanceHomeSidebar
        active="atendimento"
        user={user}
        onNavigate={onNavigate}
        onUnavailable={onUnavailable}
        onOpenMacrosAdmin={onOpenMacrosAdmin}
      />
      <main className="attendance-home-shell">
        <AttendanceHomeTopbar
          active={active}
          elapsed={elapsed}
          theme={theme}
          waitingTickets={waitingTickets}
          onBack={onOpenQueue}
          onOpenQueue={onOpenQueue}
          onToggleTheme={onToggleTheme}
          onLogout={onLogout}
        />

        <section className="attendance-home-content" aria-label="Home do atendimento">
          <article className="attendance-home-hero">
            <div className="attendance-home-hero-icon">
              <Headset size={34} aria-hidden="true" />
            </div>
            <div>
              <h2>
                Bom dia, <span>{firstName}</span>
              </h2>
              <p>
                Você ainda não está disponível para atendimento. Inicie quando estiver pronto para
                receber tickets e chamadas.
              </p>
            </div>
          </article>

          <div className="attendance-home-stats" aria-label="Resumo do atendimento">
            <article className="attendance-home-stat">
              <span className="attendance-home-stat-icon">
                <Briefcase size={20} aria-hidden="true" />
              </span>
              <div>
                <h3>Aguardando atendimento</h3>
                <p>
                  <strong>{waitingTickets}</strong> tickets
                </p>
              </div>
            </article>
            <article className="attendance-home-stat">
              <span className="attendance-home-stat-icon">
                <Clock size={20} aria-hidden="true" />
              </span>
              <div>
                <h3>Horário atual</h3>
                <p>
                  <strong>{currentTimeLabel}</strong> agora
                </p>
              </div>
            </article>
            <article className="attendance-home-stat">
              <span className="attendance-home-stat-icon warning">
                <Bell size={20} aria-hidden="true" />
              </span>
              <div>
                <h3>Notificações</h3>
                <p className="warning">{notificationsLabel}</p>
              </div>
            </article>
          </div>

          <article className="attendance-home-panel">
            <h3>
              <Volume2 size={14} aria-hidden="true" />
              Notificações sonoras
            </h3>
            <div className="attendance-home-option-grid">
              <div className="attendance-home-option">
                <span>
                  <Briefcase size={15} aria-hidden="true" />
                  Novo atendimento
                </span>
                <AttendanceHomeToggle
                  checked={settings.newAttendanceSound}
                  label="Novo atendimento"
                  onClick={() => onToggleSetting('newAttendanceSound')}
                />
              </div>
              <div className="attendance-home-option">
                <span>
                  <MessageSquareText size={15} aria-hidden="true" />
                  Nova mensagem
                </span>
                <AttendanceHomeToggle
                  checked={settings.newMessageSound}
                  label="Nova mensagem"
                  onClick={() => onToggleSetting('newMessageSound')}
                />
              </div>
            </div>
          </article>

          <article className="attendance-home-panel attendance-home-panel-pip">
            <h3>
              <PanelLeft size={14} aria-hidden="true" />
              Conversa fora do atendimento
            </h3>
            <p>
              Desligado, a conversa fica só nesta tela, nada acompanha você ao navegar para
              dashboard, disparos ou configurações.
            </p>
            <div className="attendance-home-option compact">
              <span>
                <PanelLeft size={15} aria-hidden="true" />
                Janela flutuante e PiP
              </span>
              <AttendanceHomeToggle
                checked={settings.floatingWindow}
                label="Janela flutuante e PiP"
                onClick={() => onToggleSetting('floatingWindow')}
              />
            </div>
          </article>

          <div className="attendance-home-action-block">
            <button
              type="button"
              className="attendance-home-start"
              disabled={starting}
              onClick={onStart}
            >
              {starting ? 'Iniciando...' : buttonLabel}
            </button>
            <p>
              Ao iniciar, o sistema se conecta ao servidor e libera notificações sonoras de novos
              tickets, mensagens e chamadas.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

const deskRailItems: Array<{
  id: ConversationFilter
  label: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
}> = [
  { id: 'new', label: 'Novos tickets', icon: MessageSquareText },
  { id: 'mine', label: 'Meus atendimentos', icon: Inbox },
  { id: 'open', label: 'Em atendimento', icon: Edit3 },
  { id: 'waiting_customer', label: 'Aguardando cliente', icon: CheckCheck },
  { id: 'archived', label: 'Arquivados', icon: CornerDownLeft },
]

function getConversationTimeLabel(conversation: ConversationSummary): string {
  const value = conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? formatClock(time) : ''
}

function getConversationChannelLabel(conversation: ConversationSummary): string {
  if (conversation.ticketMetadata?.diagnosis?.categoryTitle) {
    return conversation.ticketMetadata.diagnosis.categoryTitle
  }

  return conversation.subject ?? conversation.customer?.reason ?? 'Chat'
}

function AttendanceDeskTopbar({
  active,
  elapsed,
  theme,
  waitingTickets,
  channelStatusLabel,
  ticketPanelOpen,
  canManageMacros: canManageMacrosFlag,
  onToggleTicketPanel,
  onEndSession,
  onToggleTheme,
  onOpenMacrosAdmin,
  onLogout,
}: {
  active: boolean
  elapsed: string
  theme: 'dark' | 'light'
  waitingTickets: number
  channelStatusLabel: string
  ticketPanelOpen: boolean
  canManageMacros: boolean
  onToggleTicketPanel(): void
  onEndSession(): void
  onToggleTheme(): void
  onOpenMacrosAdmin(): void
  onLogout(): void
}) {
  return (
    <header className="attendance-desk-topbar">
      <div className="attendance-home-title">
        <button
          type="button"
          className={`attendance-home-back attendance-desk-panel-toggle ${
            ticketPanelOpen ? '' : 'collapsed'
          }`}
          aria-label={ticketPanelOpen ? 'Ocultar painel interno de tickets' : 'Mostrar painel interno de tickets'}
          aria-expanded={ticketPanelOpen}
          title={ticketPanelOpen ? 'Ocultar painel interno' : 'Mostrar painel interno'}
          onClick={onToggleTicketPanel}
        >
          <ArrowLeft size={19} aria-hidden="true" />
        </button>
        <span className="attendance-home-title-divider" aria-hidden="true" />
        <h1>Atendimento</h1>
      </div>

      <div className="attendance-home-toolbar">
        <span className={`attendance-home-status ${active ? 'available' : ''}`}>
          <span aria-hidden="true" />
          {active ? 'Conectado' : 'Desconectado'}
        </span>
        <span className="attendance-home-session">
          <UserRound size={16} aria-hidden="true" />
          <strong>{waitingTickets}</strong>
          <span aria-hidden="true" />
          <Clock size={16} aria-hidden="true" />
          <strong>{elapsed}</strong>
        </span>
        <button
          type="button"
          className="attendance-home-icon-button"
          aria-label="Fila de atendimento"
          title="Fila de atendimento"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <span className="attendance-desk-channel-status">
          <span aria-hidden="true" />
          {channelStatusLabel}
        </span>
        <button type="button" className="attendance-home-account" aria-label="Conta Acessanet">
          <Building2 size={17} aria-hidden="true" />
          <span>Acessanet</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <details className="attendance-home-more">
          <summary aria-label="Mais opções">
            <MoreVertical size={18} aria-hidden="true" />
          </summary>
          <div className="attendance-home-more-menu">
            <button type="button" onClick={onEndSession}>
              Ficar indisponível
            </button>
            <button type="button" onClick={onToggleTheme}>
              {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            </button>
            {canManageMacrosFlag && (
              <button type="button" onClick={onOpenMacrosAdmin}>
                Macros
              </button>
            )}
            <button type="button" onClick={onLogout}>
              Sair
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}

function AttendanceDeskWelcome() {
  return (
    <section className="attendance-desk-welcome" aria-label="Bem-vindo ao Desk">
      <span className="attendance-desk-welcome-icon" aria-hidden="true">
        <MessageSquareText size={30} />
      </span>
      <h2>Bem-vindo ao Desk</h2>
      <p>
        Selecione um ticket da lista ao lado para começar a visualizar conversas, responder emails
        ou gerenciar solicitações de suporte.
      </p>

      <div className="attendance-desk-feature-list">
        <article className="attendance-desk-feature">
          <span className="chat" aria-hidden="true">
            <MessageSquareText size={22} />
          </span>
          <div>
            <h3>Chat em Tempo Real</h3>
            <p>Converse com clientes no web-chat, em tempo real</p>
          </div>
        </article>
        <article className="attendance-desk-feature">
          <span className="whatsapp" aria-hidden="true">
            <MessageCircle size={22} />
          </span>
          <div>
            <h3>WhatsApp business</h3>
            <p>Acesso direto aos contatos feitos por usuários ao WhatsApp business</p>
          </div>
        </article>
        <article className="attendance-desk-feature">
          <span className="voice" aria-hidden="true">
            <Phone size={22} />
          </span>
          <div>
            <h3>Chamadas de voz</h3>
            <p>Atenda a chamadas de voz de forma simples e integrada com a tabulação.</p>
          </div>
        </article>
        <article className="attendance-desk-feature">
          <span className="mail" aria-hidden="true">
            <Mail size={22} />
          </span>
          <div>
            <h3>E-mail</h3>
            <p>Veja contatos realizados via e-mail e responda sem mudar de tela.</p>
          </div>
        </article>
      </div>

      <span className="attendance-desk-start-hint">← Clique em um ticket para começar</span>
    </section>
  )
}

function AttendanceDesk({
  user,
  active,
  elapsed,
  theme,
  waitingTickets,
  channelStatusLabel,
  conversations,
  selectedId,
  search,
  filter,
  ticketPanelOpen,
  loading,
  error,
  children,
  onSearchChange,
  onFilterChange,
  onToggleTicketPanel,
  onSelect,
  onRetry,
  onNavigate,
  onEndSession,
  onToggleTheme,
  onOpenMacrosAdmin,
  onLogout,
}: AttendanceDeskProps) {
  return (
    <div className="attendance-home-frame attendance-desk-frame">
      <AttendanceHomeSidebar
        active="atendimento"
        user={user}
        onNavigate={onNavigate}
        onUnavailable={() => onNavigate('/atendimento')}
        onOpenMacrosAdmin={onOpenMacrosAdmin}
      />
      <main className="attendance-home-shell attendance-desk-shell">
        <AttendanceDeskTopbar
          active={active}
          elapsed={elapsed}
          theme={theme}
          waitingTickets={waitingTickets}
          canManageMacros={canManageMacros(user.role)}
          onOpenMacrosAdmin={onOpenMacrosAdmin}
          channelStatusLabel={channelStatusLabel}
          ticketPanelOpen={ticketPanelOpen}
          onToggleTicketPanel={onToggleTicketPanel}
          onEndSession={onEndSession}
          onToggleTheme={onToggleTheme}
          onLogout={onLogout}
        />

        <section className={`attendance-desk-body ${ticketPanelOpen ? '' : 'panel-collapsed'}`}>
          {ticketPanelOpen && (
          <aside className="attendance-desk-ticket-shell" aria-label="Tickets">
            <nav className="attendance-desk-rail" aria-label="Filtros de atendimento">
              {deskRailItems.map((item, index) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={filter === item.id ? 'active' : ''}
                    aria-label={item.label}
                    title={item.label}
                    onClick={() => onFilterChange(item.id)}
                  >
                    <Icon size={17} aria-hidden />
                    {(index === 2 || index === 4) && <span aria-hidden="true" />}
                  </button>
                )
              })}
            </nav>

            <div className="attendance-desk-list">
              <header className="attendance-desk-list-header">
                <label className="attendance-desk-search">
                  <span className="sr-only">Buscar</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Buscar"
                  />
                  <Search size={17} aria-hidden />
                </label>
                <button type="button" className="attendance-desk-filter-button" aria-label="Filtrar tickets">
                  <ListFilter size={18} aria-hidden />
                </button>
              </header>

              {loading && <p className="attendance-desk-feedback">Carregando tickets...</p>}
              {!loading && error && (
                <div className="attendance-desk-error" role="alert">
                  <p>{error}</p>
                  <button type="button" onClick={onRetry}>
                    Tentar novamente
                  </button>
                </div>
              )}
              {!loading && !error && conversations.length === 0 && (
                <div className="attendance-desk-empty-list">
                  <span aria-hidden="true">
                    <MessageSquareText size={27} />
                  </span>
                  <h2>Nenhum ticket ainda</h2>
                  <p>
                    Quando novos tickets chegarem, eles aparecerão aqui. Você pode visualizar,
                    responder e gerenciar todos os atendimentos.
                  </p>
                  <small>Aguardando novos tickets...</small>
                </div>
              )}
              {!loading && !error && conversations.length > 0 && (
                <div className="attendance-desk-ticket-list">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      className={`attendance-desk-ticket ${selectedId === conversation.id ? 'selected' : ''}`}
                      onClick={() => onSelect(conversation.id)}
                    >
                      <span className="attendance-desk-ticket-avatar" aria-hidden="true">
                        {getInitials(conversation.customerName, conversation.customerName)}
                      </span>
                      <span className="attendance-desk-ticket-body">
                        <span className="attendance-desk-ticket-head">
                          <strong>{conversation.customerName}</strong>
                          <time>{getConversationTimeLabel(conversation)}</time>
                        </span>
                        <span className="attendance-desk-ticket-channel">
                          {getConversationChannelLabel(conversation)}
                        </span>
                        <span className="attendance-desk-ticket-preview">
                          {conversation.lastMessage ?? 'Sem mensagens recentes.'}
                        </span>
                        <span className="attendance-desk-ticket-meta">
                          <span>{conversation.status}</span>
                          {conversation.assignedAgentName && <span>{conversation.assignedAgentName}</span>}
                          {conversation.tags?.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                        </span>
                      </span>
                      {conversation.unreadCount > 0 && (
                        <span className="attendance-desk-unread">{conversation.unreadCount}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
          )}

          <div className="attendance-desk-main">{children}</div>
        </section>
      </main>
    </div>
  )
}

function upsertConversation(
  conversations: ConversationSummary[],
  nextConversation: ConversationSummary,
  moveToTop = true,
): ConversationSummary[] {
  const without = conversations.filter((conversation) => conversation.id !== nextConversation.id)
  if (moveToTop) return [nextConversation, ...without]

  return conversations.map((conversation) =>
    conversation.id === nextConversation.id ? nextConversation : conversation,
  )
}

function matchesConversationFilter(
  conversation: ConversationSummary,
  filter: ConversationFilter,
  agentId?: string,
): boolean {
  if (filter === 'archived') return Boolean(conversation.archivedAt)
  if (conversation.archivedAt) return false

  if (filter === 'new') {
    return (
      conversation.assignedAgentId === null &&
      (conversation.status === 'new' || conversation.status === 'waiting_agent')
    )
  }

  if (filter === 'mine') {
    return conversation.assignedAgentId === agentId && conversation.status !== 'closed'
  }

  if (filter === 'open') {
    return conversation.status === 'open' || conversation.status === 'waiting_agent'
  }

  return conversation.status === filter
}

function syncConversationForFilter(
  conversations: ConversationSummary[],
  nextConversation: ConversationSummary,
  filter: ConversationFilter,
  agentId?: string,
  moveToTop = false,
): ConversationSummary[] {
  const belongs = matchesConversationFilter(nextConversation, filter, agentId)
  const exists = conversations.some((conversation) => conversation.id === nextConversation.id)

  if (belongs) {
    return upsertConversation(conversations, nextConversation, moveToTop || !exists)
  }

  return exists
    ? conversations.filter((conversation) => conversation.id !== nextConversation.id)
    : conversations
}

function mergeActiveFilterCount(
  counts: ConversationCounts | null,
  filter: ConversationFilter,
  total: number,
): ConversationCounts {
  return {
    ...(counts ?? initialCounts),
    [filter]: total,
  }
}

function incrementCountsForConversation(
  counts: ConversationCounts | null,
  conversation: ConversationSummary,
  agentId: string,
): ConversationCounts {
  const next = { ...(counts ?? initialCounts) }

  if (matchesConversationFilter(conversation, 'new', agentId)) next.new += 1
  if (matchesConversationFilter(conversation, 'mine', agentId)) next.mine += 1
  if (matchesConversationFilter(conversation, 'open', agentId)) next.open += 1
  if (matchesConversationFilter(conversation, 'waiting_customer', agentId)) {
    next.waiting_customer += 1
  }

  return next
}

function upsertAgentOption(agents: AgentOption[], nextAgent: AgentOption): AgentOption[] {
  const exists = agents.some((agent) => agent.id === nextAgent.id)
  if (!exists) return [...agents, nextAgent]

  return agents.map((agent) => (agent.id === nextAgent.id ? { ...agent, ...nextAgent } : agent))
}

function mergeUserFromAgent(user: AgentUser, agent: AgentOption): AgentUser {
  return {
    ...user,
    id: agent.id,
    name: agent.name,
    email: agent.email || user.email,
    role: agent.role,
    attendanceStatus: agent.attendanceStatus,
    attendanceStatusChangedAt: agent.attendanceStatusChangedAt,
    presence: agent.presence,
  }
}

function updateConversationFromMessage(
  conversations: ConversationSummary[],
  message: Message,
  selectedConversationId?: string,
): ConversationSummary[] {
  const existing = conversations.find((conversation) => conversation.id === message.conversationId)
  if (!existing) return conversations

  const nextConversation: ConversationSummary = {
    ...existing,
    unreadCount:
      message.authorType === 'customer' && selectedConversationId !== message.conversationId
        ? existing.unreadCount + 1
        : existing.unreadCount,
    lastMessage: message.body,
    lastMessageAt: message.createdAt,
    lastCustomerMessageAt:
      message.authorType === 'customer' ? message.createdAt : existing.lastCustomerMessageAt,
    waitingSince:
      message.authorType === 'customer'
        ? message.createdAt
        : message.authorType === 'agent'
          ? undefined
          : existing.waitingSince,
    archivedAt: message.authorType === 'customer' ? null : existing.archivedAt,
    updatedAt: message.createdAt,
  }

  return upsertConversation(conversations, nextConversation, selectedConversationId !== message.conversationId)
}

function replacePendingMessage(messages: Message[], clientMessageId: string, nextMessage: Message): Message[] {
  const confirmedMessage = {
    ...nextMessage,
    clientMessageId: nextMessage.clientMessageId ?? clientMessageId,
  }
  const withoutPending = messages.filter((message) => {
    return message.id !== clientMessageId && message.clientMessageId !== clientMessageId
  })

  return mergeMessages(withoutPending, [confirmedMessage])
}

function getMessageOrder(message: Message): number {
  const numericId = Number(message.id)
  if (Number.isFinite(numericId)) return numericId

  const time = new Date(message.createdAt).getTime()
  return Number.isFinite(time) ? time : 0
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((left, right) => getMessageOrder(left) - getMessageOrder(right))
}

function mergeMessages(messages: Message[], nextMessages: Message[]): Message[] {
  const merged: Message[] = []

  for (const message of [...messages, ...nextMessages]) {
    const existingIndex = merged.findIndex((item) => {
      return (
        item.id === message.id ||
        item.id === message.clientMessageId ||
        item.clientMessageId === message.id ||
        (Boolean(item.clientMessageId) && item.clientMessageId === message.clientMessageId)
      )
    })

    if (existingIndex >= 0) {
      merged[existingIndex] = message
    } else {
      merged.push(message)
    }
  }

  return sortMessages(merged)
}

function joinConversationRoom(nextConversationId: string): void {
  chatSocket.emit('join_conversation', {
    conversation_id: nextConversationId,
    conversationId: nextConversationId,
  })
}

function getAgentDisplayName(user: AgentUser): string {
  return user.name.trim() || user.email || 'Atendimento'
}

function isGenericAgentAuthorName(authorName: string): boolean {
  const normalized = authorName.trim().toLowerCase()
  return !normalized || normalized === 'atendimento' || normalized === 'atendente'
}

function isGenericCustomerAuthorName(authorName: string): boolean {
  const normalized = authorName.trim().toLowerCase()
  return !normalized || normalized === 'cliente' || normalized === 'customer'
}

function getAgentNameForMessage(
  message: Message,
  agentsById: Map<string, AgentOption>,
  user: AgentUser,
  conversation: ConversationDetail | null,
): string | null {
  const senderId = message.senderId ? String(message.senderId) : null
  const currentAgentName = getAgentDisplayName(user)

  if (senderId === String(user.id)) return currentAgentName

  if (senderId) {
    const agentName = agentsById.get(senderId)?.name
    if (agentName) return agentName

    if (conversation?.assignedAgentId && senderId === String(conversation.assignedAgentId)) {
      return conversation.assignedAgentName ?? null
    }
  }

  if (!senderId) return conversation?.assignedAgentName ?? currentAgentName

  return null
}

function enrichMessageAuthors(
  messages: Message[],
  agents: AgentOption[],
  user: AgentUser,
  conversation: ConversationDetail | null,
): Message[] {
  const agentsById = new Map(agents.map((agent) => [String(agent.id), agent]))
  let changed = false

  const hydrated = messages.map((message) => {
    if (
      message.authorType === 'customer' &&
      isGenericCustomerAuthorName(message.authorName) &&
      conversation?.id === message.conversationId
    ) {
      const authorName = conversation.customerName || conversation.customer.name
      if (authorName && authorName !== message.authorName) {
        changed = true
        return {
          ...message,
          authorName,
        }
      }
    }

    if (message.authorType !== 'agent' || !isGenericAgentAuthorName(message.authorName)) {
      return message
    }

    const authorName = getAgentNameForMessage(message, agentsById, user, conversation)
    if (!authorName || authorName === message.authorName) return message

    changed = true
    return {
      ...message,
      authorName,
    }
  })

  return changed ? hydrated : messages
}

function withCurrentAgentIdentity(message: Message, user: AgentUser): Message {
  if (message.authorType !== 'agent') return message

  return {
    ...message,
    senderId: message.senderId ?? user.id,
    authorName: isGenericAgentAuthorName(message.authorName)
      ? getAgentDisplayName(user)
      : message.authorName,
  }
}

export function AtendimentoPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { user, logout, updateUser } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const notifier = useNotifier()

  const [filter, setFilter] = useState<ConversationFilter>('new')
  const tagFilter = defaultConversationTagFilter
  const queueSort = defaultConversationQueueSort
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [counts, setCounts] = useState<ConversationCounts | null>(initialCounts)
  const [slaNow, setSlaNow] = useState(() => Date.now())
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [messageCursor, setMessageCursor] = useState<string | null>(null)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [tagsUpdating, setTagsUpdating] = useState(false)
  const [connectionState, setConnectionState] = useState<SocketConnectionState>('idle')
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string>>({})
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [attendanceStatusUpdating, setAttendanceStatusUpdating] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [archiveActionId, setArchiveActionId] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')
  const [notes, setNotes] = useState<ConversationNote[]>([])
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickRepliesAdminOpen, setQuickRepliesAdminOpen] = useState(false)
  const [macroAdminOpen, setMacroAdminOpen] = useState(false)
  const [pendingMacro, setPendingMacro] = useState<Macro | null>(null)
  const {
    macros,
    loading: macrosLoading,
    reload: reloadMacros,
    recentMacros,
    favoriteIds: favoriteMacroIds,
    registerRecent: registerRecentMacro,
  } = useMacros()
  const [attendanceStartedAt, setAttendanceStartedAt] = useState<number | null>(null)
  const [sessionNow, setSessionNow] = useState(() => Date.now())
  const [homeSettings, setHomeSettings] = useState<AttendanceHomeSettings>(readHomeSettings)
  const [ticketPanelOpen, setTicketPanelOpen] = useState(readTicketPanelOpen)

  const selectedConversationIdRef = useRef<string | undefined>(conversationId)
  const conversationsRef = useRef<ConversationSummary[]>([])
  const homeSettingsRef = useRef(homeSettings)

  useEffect(() => {
    selectedConversationIdRef.current = conversationId
  }, [conversationId])

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    homeSettingsRef.current = homeSettings
    persistHomeSettings(homeSettings)
  }, [homeSettings])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = window.setInterval(() => setSlaNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!user?.id) {
      setAttendanceStartedAt(null)
      setSessionNow(Date.now())
      return
    }

    setAttendanceStartedAt(readAttendanceSession(user.id))
    setSessionNow(Date.now())
  }, [user?.id])

  useEffect(() => {
    if (!attendanceStartedAt) return undefined

    setSessionNow(Date.now())
    const timer = window.setInterval(() => setSessionNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [attendanceStartedAt])

  useEffect(() => {
    if (!user?.id || user.attendanceStatus !== 'INVISIBLE') return

    clearAttendanceSession(user.id)
    setAttendanceStartedAt(null)
    setSessionNow(Date.now())
  }, [user?.attendanceStatus, user?.id])

  useEffect(() => {
    function refreshSessionClock() {
      setSessionNow(Date.now())
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshSessionClock()
    }

    window.addEventListener('focus', refreshSessionClock)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', refreshSessionClock)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return undefined
    const userId = user.id

    function handleStorage(event: StorageEvent) {
      if (event.key !== getAttendanceSessionStorageKey(userId)) return

      setAttendanceStartedAt(readAttendanceSession(userId))
      setSessionNow(Date.now())
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [user?.id])

  const handleSessionError = useCallback(
    (error: unknown, fallback: string): string => {
      if (error instanceof UnauthorizedError) {
        void logout()
        return 'Login expirou. Entre novamente.'
      }

      return getReadableError(error, fallback)
    },
    [logout],
  )

  const loadConversations = useCallback(async () => {
    setListLoading(true)
    setListError('')

    try {
      const response = await conversationsApi.list({
        filter,
        search: debouncedSearch,
        tag: tagFilter,
        sort: queueSort,
        page: 1,
        perPage: 35,
      })
      const responseMatchesTag =
        tagFilter === 'all' ||
        response.data.every((conversation) => conversation.tags?.includes(tagFilter))
      const total = responseMatchesTag
        ? response.pagination.total ?? response.data.length
        : response.data.length
      setConversations(response.data)
      setCounts((current) =>
        response.counts ?? (tagFilter === 'all' ? mergeActiveFilterCount(current, filter, total) : current),
      )
    } catch (error) {
      setListError(handleSessionError(error, 'Não foi possível conectar ao atendimento.'))
    } finally {
      setListLoading(false)
    }
  }, [debouncedSearch, filter, handleSessionError, queueSort, tagFilter])

  const loadAgents = useCallback(async (silent = false): Promise<boolean> => {
    try {
      const response = await agentsApi.list()
      setAgents(response)
      return true
    } catch (error) {
      if (!silent) {
        setActionMessage(handleSessionError(error, 'Não foi possível carregar atendentes conectados.'))
      }

      return false
    }
  }, [handleSessionError])

  const markConversationRead = useCallback(async (nextConversationId: string) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === nextConversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    )
    chatSocket.emit('mark_read', {
      conversation_id: nextConversationId,
      conversationId: nextConversationId,
    })

    try {
      await conversationsApi.markRead(nextConversationId)
    } catch {
      setConversations((current) => current)
    }
  }, [])

  const loadSelectedConversation = useCallback(
    async (nextConversationId: string, silent = false) => {
      if (!silent) {
        setMessagesLoading(true)
        setMessageError('')
      }

      try {
        const [conversation, messagePage, notePage] = await Promise.all([
          conversationsApi.get(nextConversationId),
          conversationsApi.getMessages(nextConversationId, { perPage: 30 }),
          conversationsApi.listNotes(nextConversationId).catch(() => []),
        ])
        setSelectedConversation(conversation)
        setMessages((current) =>
          silent && selectedConversationIdRef.current === nextConversationId
            ? mergeMessages(current, messagePage.data)
            : messagePage.data,
        )
        setHasMoreMessages(messagePage.pagination.hasMore)
        setMessageCursor(messagePage.pagination.nextCursor ?? null)
        if (!silent || selectedConversationIdRef.current === nextConversationId) {
          setNotes(notePage)
        }
        void markConversationRead(nextConversationId)
      } catch (error) {
        setMessageError(handleSessionError(error, 'Não foi possível carregar esta conversa.'))
      } finally {
        if (!silent) setMessagesLoading(false)
      }
    },
    [handleSessionError, markConversationRead],
  )

  const addNote = useCallback(
    async (note: string) => {
      if (!conversationId || !note.trim()) return

      setNoteSubmitting(true)

      try {
        const record = await conversationsApi.addNote(conversationId, note.trim())
        setNotes((current) => (current.some((item) => item.id === record.id) ? current : [...current, record]))
      } catch (error) {
        setActionMessage(handleSessionError(error, 'Não foi possível adicionar a nota interna.'))
      } finally {
        setNoteSubmitting(false)
      }
    },
    [conversationId, handleSessionError],
  )

  // Motor de execução de Macros: reaproveita o mesmo envio de mensagem (handleSend)
  // e as mesmas APIs de tags/notas/transferência já usadas pelo resto da página.
  const macroRunner: MacroActionRunner = {
    getTags: () => selectedConversation?.tags ?? [],
    sendMessage: (text) => handleSend(text),
    async updateTags(tags) {
      if (!conversationId) return
      const conversation = await conversationsApi.updateTags(conversationId, tags)
      setSelectedConversation(conversation)
      setConversations((current) => syncConversationForFilter(current, conversation, filter, user?.id))
    },
    async addNote(text) {
      if (!conversationId || !text.trim()) return
      const note = await conversationsApi.addNote(conversationId, text.trim())
      setNotes((current) => (current.some((item) => item.id === note.id) ? current : [...current, note]))
    },
    async setPriority(priority) {
      if (!conversationId) return
      const conversation = await conversationsApi.setPriority(conversationId, priority)
      setSelectedConversation(conversation)
      setConversations((current) => syncConversationForFilter(current, conversation, filter, user?.id))
    },
    async transferToAgent(agentId) {
      if (!conversationId) return
      const conversation = await conversationsApi.transfer(conversationId, agentId)
      setSelectedConversation(conversation)
      setConversations((current) => syncConversationForFilter(current, conversation, filter, user?.id))
    },
  }

  const macroExecution = useMacroExecution(macroRunner)

  function handleTriggerMacro(macro: Macro) {
    registerRecentMacro(macro.id)
    setPendingMacro(macro)
  }

  function confirmMacroExecution() {
    if (!pendingMacro || !selectedConversation) return

    const macro = pendingMacro
    setPendingMacro(null)
    void macroExecution.start(macro, selectedConversation)
  }

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!user) return

    quickRepliesApi
      .list()
      .then(setQuickReplies)
      .catch(() => setQuickReplies([]))
  }, [user])

  const openTransferDialogRef = useRef(openTransferDialog)

  useEffect(() => {
    openTransferDialogRef.current = openTransferDialog
  })

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    }

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }

      if (isEditableTarget(event.target)) return

      if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }

      if (event.altKey && event.key.toLowerCase() === 't' && conversationId && canTransfer(user?.role)) {
        event.preventDefault()
        void openTransferDialogRef.current()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'e' && conversationId && canCloseConversation(user?.role)) {
        event.preventDefault()
        setCloseOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [conversationId, user])

  useEffect(() => {
    if (!user) return undefined

    void loadAgents(true)
    const timer = window.setInterval(() => {
      void loadAgents(true)
    }, 30_000)

    return () => window.clearInterval(timer)
  }, [loadAgents, user])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!conversationId) {
      setSelectedConversation(null)
      setMessages([])
      setMessageError('')
      setNotes([])
      return
    }

    setNotes([])

    joinConversationRoom(conversationId)
    void loadSelectedConversation(conversationId)

    return () => {
      chatSocket.emit('leave_conversation', {
        conversation_id: conversationId,
        conversationId,
      })
    }
  }, [conversationId, loadSelectedConversation])

  useEffect(() => {
    if (!conversationId || !user) return undefined

    const timer = window.setInterval(() => {
      void loadSelectedConversation(conversationId, true)
    }, 5_000)

    return () => window.clearInterval(timer)
  }, [conversationId, loadSelectedConversation, user])

  useEffect(() => {
    if (!user) return undefined

    chatSocket.connect({ agentId: user.id })

    const offState = chatSocket.onConnectionChange((state) => {
      setConnectionState(state)
      if (state === 'connected') {
        void loadConversations()
        void loadAgents(true)
        if (selectedConversationIdRef.current) {
          joinConversationRoom(selectedConversationIdRef.current)
          void loadSelectedConversation(selectedConversationIdRef.current, true)
        }
      }
    })

    const offCreated = chatSocket.on('conversation_created', (conversation) => {
      setCounts((current) => incrementCountsForConversation(current, conversation, user.id))
      setConversations((current) =>
        syncConversationForFilter(current, conversation, filter, user.id, true),
      )
      if (conversation.assignedAgentId === null || conversation.assignedAgentId === user.id) {
        if (homeSettingsRef.current.newAttendanceSound) notifier.playMessageSound()
        notifier.showNotification('Novo atendimento', `${conversation.customerName}: ${conversation.subject ?? ''}`, () => {
          navigate(`/atendimento/${conversation.id}`)
        })
      }
    })

    const offUpdated = chatSocket.on('conversation_updated', (conversation) => {
      setConversations((current) =>
        syncConversationForFilter(current, conversation, filter, user.id),
      )
      if (selectedConversationIdRef.current === conversation.id) {
        setSelectedConversation((current) =>
          current ? { ...current, ...conversation, customer: current.customer } : current,
        )
        void loadSelectedConversation(conversation.id, true)
      }
    })

    const offAssigned = chatSocket.on('conversation_assigned', (conversation) => {
      setConversations((current) =>
        syncConversationForFilter(current, conversation, filter, user.id),
      )
    })

    const offTransferred = chatSocket.on('conversation_transferred', (conversation) => {
      setConversations((current) =>
        syncConversationForFilter(current, conversation, filter, user.id),
      )
      if (selectedConversationIdRef.current === conversation.id) {
        void loadSelectedConversation(conversation.id, true)
      }
    })

    const offClosed = chatSocket.on('conversation_closed', (conversation) => {
      setConversations((current) =>
        syncConversationForFilter(current, conversation, filter, user.id),
      )
      if (selectedConversationIdRef.current === conversation.id) {
        setSelectedConversation((current) =>
          current ? { ...current, status: 'closed', updatedAt: conversation.updatedAt } : current,
        )
      }
    })

    const offMessageRead = chatSocket.on('message_read', (payload) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === payload.conversationId ? { ...conversation, unreadCount: 0 } : conversation,
        ),
      )
    })

    const offTyping = chatSocket.on('typing', (payload) => {
      setTypingByConversation((current) => {
        const next = { ...current }
        if (payload.isTyping) {
          next[payload.conversationId] = payload.customerName
        } else {
          delete next[payload.conversationId]
        }
        return next
      })
    })

    const offUserStatusChanged = chatSocket.on('user:status_changed', (payload) => {
      const changedAt = payload.changedAt ?? new Date().toISOString()
      setAgents((current) =>
        current.map((agent) =>
          agent.id === payload.userId
            ? { ...agent, attendanceStatus: payload.status, attendanceStatusChangedAt: changedAt }
            : agent,
        ),
      )
      if (payload.userId === user.id) {
        updateUser({ ...user, attendanceStatus: payload.status, attendanceStatusChangedAt: changedAt })
        if (payload.status === 'INVISIBLE') {
          clearAttendanceSession(user.id)
          setAttendanceStartedAt(null)
          setSessionNow(Date.now())
        }
        setActionMessage(getAttendanceStatusHelper(payload.status))
      }
    })

    const offNewMessage = chatSocket.on('new_message', (message) => {
      const activeConversationId = selectedConversationIdRef.current

      if (activeConversationId === message.conversationId) {
        setMessages((current) => {
          const exists = current.some((item) => {
            return (
              item.id === message.id ||
              (message.clientMessageId && item.clientMessageId === message.clientMessageId)
            )
          })
          return exists ? current : sortMessages([...current, message])
        })
        setSelectedConversation((current) =>
          current?.id === message.conversationId
            ? {
                ...current,
                lastMessage: message.body,
                lastMessageAt: message.createdAt,
                lastCustomerMessageAt:
                  message.authorType === 'customer' ? message.createdAt : current.lastCustomerMessageAt,
                waitingSince:
                  message.authorType === 'customer'
                    ? message.createdAt
                    : message.authorType === 'agent'
                      ? undefined
                      : current.waitingSince,
                archivedAt: message.authorType === 'customer' ? null : current.archivedAt,
                updatedAt: message.createdAt,
              }
            : current,
        )
        if (message.authorType === 'customer') void markConversationRead(message.conversationId)
      } else if (message.authorType === 'customer') {
        if (homeSettingsRef.current.newMessageSound) notifier.playMessageSound()
        const conversation = conversationsRef.current.find((item) => item.id === message.conversationId)
        notifier.showNotification(
          'AcessaNet Atendimento',
          `${conversation?.customerName ?? message.authorName}: ${message.body}`,
          () => navigate(`/atendimento/${message.conversationId}`),
        )
      }

      setConversations((current) =>
        updateConversationFromMessage(current, message, activeConversationId),
      )
    })

    const offNoteAdded = chatSocket.on('note_added', (note) => {
      if (selectedConversationIdRef.current !== note.conversationId) return
      setNotes((current) => (current.some((item) => item.id === note.id) ? current : [...current, note]))
    })

    return () => {
      offState()
      offCreated()
      offUpdated()
      offAssigned()
      offTransferred()
      offClosed()
      offMessageRead()
      offTyping()
      offUserStatusChanged()
      offNewMessage()
      offNoteAdded()
      chatSocket.disconnect()
    }
  }, [
    filter,
    loadAgents,
    loadConversations,
    loadSelectedConversation,
    markConversationRead,
    navigate,
    notifier,
    updateUser,
    user,
  ])

  const totalUnread = useMemo(() => {
    return conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)
  }, [conversations])

  const displayedConversations = useMemo(() => {
    return applyConversationQueueView(conversations, {
      tagFilter,
      sort: queueSort,
      now: slaNow,
    })
  }, [conversations, queueSort, slaNow, tagFilter])

  const currentAgentName = user ? getAgentDisplayName(user) : 'Atendimento'

  const displayedMessages = useMemo(() => {
    if (!user) return messages
    return enrichMessageAuthors(messages, agents, user, selectedConversation)
  }, [agents, messages, selectedConversation, user])

  useEffect(() => {
    document.title =
      totalUnread > 0 ? `(${totalUnread}) AcessaNet Atendimento` : 'AcessaNet Atendimento'
  }, [totalUnread])

  async function loadOlderMessages() {
    if (!conversationId || !messageCursor) return

    try {
      const response = await conversationsApi.getMessages(conversationId, {
        cursor: messageCursor,
        perPage: 30,
      })
      setMessages((current) => mergeMessages(response.data, current))
      setHasMoreMessages(response.pagination.hasMore)
      setMessageCursor(response.pagination.nextCursor ?? null)
    } catch (error) {
      setMessageError(handleSessionError(error, 'Não foi possível carregar mensagens anteriores.'))
    }
  }

  async function updateStatus(
    status: ConversationStatus,
    options: { closeReason?: ConversationCloseReason; closeReasonNote?: string } = {},
  ): Promise<boolean> {
    if (!conversationId) return false

    setStatusUpdating(true)
    setActionMessage('')

    try {
      const conversation = await conversationsApi.updateStatus(conversationId, status, options)
      setSelectedConversation(conversation)
      setConversations((current) => syncConversationForFilter(current, conversation, filter, user?.id))
      setActionMessage(status === 'waiting_customer' ? 'Atendimento aguardando cliente.' : 'Status atualizado.')
      void loadConversations()
      return true
    } catch (error) {
      setActionMessage(handleSessionError(error, 'Não foi possível atualizar o status.'))
      return false
    } finally {
      setStatusUpdating(false)
    }
  }

  function applyAgentUpdate(agent: AgentOption) {
    setAgents((current) => upsertAgentOption(current, agent))

    if (user?.id === agent.id) {
      updateUser(mergeUserFromAgent(user, agent))
    }
  }

  async function updateOwnAttendanceStatus(status: AttendanceStatus): Promise<boolean> {
    if (!user) return false
    if (status === user.attendanceStatus) return true

    setAttendanceStatusUpdating(true)
    setActionMessage('')

    try {
      const updatedAgent = await agentsApi.updateOwnAttendanceStatus(status)
      applyAgentUpdate(updatedAgent)
      if (status === 'AVAILABLE') {
        setAttendanceStartedAt((currentStartedAt) => {
          if (currentStartedAt) return currentStartedAt

          const startedAt = Date.now()
          persistAttendanceSession(user.id, startedAt)
          return startedAt
        })
        setSessionNow(Date.now())
      } else {
        deactivateAttendanceSession(user.id)
      }
      setActionMessage(getAttendanceStatusHelper(status))
      return true
    } catch (error) {
      setActionMessage(handleSessionError(error, 'Não foi possível atualizar seu status de atendimento.'))
      return false
    } finally {
      setAttendanceStatusUpdating(false)
    }
  }

  function handleSend(body: string) {
    if (!conversationId || !user) return

    const clientMessageId = createClientMessageId()
    const pendingMessage: Message = {
      id: clientMessageId,
      conversationId,
      clientMessageId,
      authorType: 'agent',
      senderId: user.id,
      authorName: currentAgentName,
      body,
      createdAt: new Date().toISOString(),
      status: 'sending',
    }

    setMessages((current) => mergeMessages(current, [pendingMessage]))
    setConversations((current) => updateConversationFromMessage(current, pendingMessage, conversationId))
    setSelectedConversation((current) =>
      current?.id === conversationId
        ? {
            ...current,
            waitingSince: undefined,
            lastMessage: body,
            lastMessageAt: pendingMessage.createdAt,
            updatedAt: pendingMessage.createdAt,
          }
        : current,
    )

    const sendByHttp = () => conversationsApi.sendMessage(conversationId, body, clientMessageId)
    const sendPromise =
      connectionState === 'connected'
        ? chatSocket
            .sendMessage({
              conversationId,
              body,
              clientMessageId,
              agentId: user.id,
              authorName: currentAgentName,
              technicianName: currentAgentName,
            })
            .catch(sendByHttp)
        : sendByHttp()

    void sendPromise
      .then((sentMessage) => {
        setMessages((current) =>
          replacePendingMessage(current, clientMessageId, {
            ...withCurrentAgentIdentity(sentMessage, user),
            status: 'sent',
          }),
        )
        void loadSelectedConversation(conversationId, true)
      })
      .catch(() => {
        setMessages((current) =>
          replacePendingMessage(current, clientMessageId, {
            ...pendingMessage,
            status: 'failed',
          }),
        )
      })
  }

  function retryMessage(message: Message) {
    if (!conversationId || !message.clientMessageId || !user) return

    setMessages((current) =>
      replacePendingMessage(current, message.clientMessageId ?? '', {
        ...message,
        status: 'sending',
      }),
    )

    const clientMessageId = message.clientMessageId
    const sendByHttp = () => conversationsApi.sendMessage(conversationId, message.body, clientMessageId)
    const sendPromise =
      connectionState === 'connected'
        ? chatSocket
            .sendMessage({
              conversationId,
              body: message.body,
              clientMessageId,
              agentId: user.id,
              authorName: currentAgentName,
              technicianName: currentAgentName,
            })
            .catch(sendByHttp)
        : sendByHttp()

    void sendPromise
      .then((sentMessage) => {
        setMessages((current) =>
          replacePendingMessage(current, clientMessageId, {
            ...withCurrentAgentIdentity(sentMessage, user),
            status: 'sent',
          }),
        )
        void loadSelectedConversation(conversationId, true)
      })
      .catch(() => {
        setMessages((current) =>
          replacePendingMessage(current, clientMessageId, {
            ...message,
            status: 'failed',
          }),
        )
      })
  }

  async function openTransferDialog() {
    setTransferOpen(true)
    setActionMessage('')
    await loadAgents()
  }

  async function transferConversation(agentId: string) {
    if (!conversationId) return

    setTransferLoading(true)
    setActionMessage('')

    try {
      const conversation = await conversationsApi.transfer(conversationId, agentId)
      setSelectedConversation(conversation)
      setConversations((current) => syncConversationForFilter(current, conversation, filter, user?.id))
      setTransferOpen(false)
      setActionMessage('Atendimento transferido.')
      void loadConversations()
    } catch (error) {
      setActionMessage(handleSessionError(error, 'Não foi possível transferir o atendimento.'))
    } finally {
      setTransferLoading(false)
    }
  }

  async function closeConversation(reason: ConversationCloseReason, note: string) {
    const updated = await updateStatus('closed', {
      closeReason: reason,
      closeReasonNote: note,
    })
    if (updated) setCloseOpen(false)
  }

  async function archiveConversation(nextConversationId: string) {
    setArchiveActionId(nextConversationId)
    setActionMessage('')

    try {
      const conversation = await conversationsApi.archive(nextConversationId)
      setConversations((current) => syncConversationForFilter(current, conversation, filter, user?.id))
      if (conversationId === nextConversationId) setSelectedConversation(conversation)
      setActionMessage('Conversa arquivada.')
      void loadConversations()
    } catch (error) {
      setActionMessage(handleSessionError(error, 'Não foi possível arquivar esta conversa.'))
    } finally {
      setArchiveActionId(null)
    }
  }

  async function restoreConversation(nextConversationId: string) {
    setArchiveActionId(nextConversationId)
    setActionMessage('')

    try {
      const conversation = await conversationsApi.restore(nextConversationId)
      setConversations((current) => syncConversationForFilter(current, conversation, filter, user?.id))
      if (conversationId === nextConversationId) setSelectedConversation(conversation)
      setActionMessage('Conversa restaurada.')
      void loadConversations()
    } catch (error) {
      setActionMessage(handleSessionError(error, 'Não foi possível restaurar esta conversa.'))
    } finally {
      setArchiveActionId(null)
    }
  }

  async function updateConversationTags(tags: ConversationTag[]) {
    if (!conversationId) return

    setTagsUpdating(true)
    setActionMessage('')

    try {
      const conversation = await conversationsApi.updateTags(conversationId, tags)
      setSelectedConversation(conversation)
      setConversations((current) => syncConversationForFilter(current, conversation, filter, user?.id))
      setActionMessage('Categorias atualizadas.')
    } catch (error) {
      setActionMessage(handleSessionError(error, 'Não foi possível atualizar as categorias.'))
    } finally {
      setTagsUpdating(false)
    }
  }

  function openDeleteDialog(nextConversationId: string) {
    setDeleteTargetId(nextConversationId)
    setDeleteOpen(true)
    setActionMessage('')
  }

  async function deleteConversation() {
    const targetId = deleteTargetId ?? conversationId
    if (!targetId) return

    setDeletingId(targetId)
    setActionMessage('')

    try {
      await conversationsApi.delete(targetId)
      setConversations((current) => current.filter((conversation) => conversation.id !== targetId))
      setTypingByConversation((current) => {
        const next = { ...current }
        delete next[targetId]
        return next
      })

      if (conversationId === targetId) {
        setSelectedConversation(null)
        setMessages([])
        setMessageError('')
        setMessageCursor(null)
        setHasMoreMessages(false)
        setNotes([])
        navigate('/atendimento')
      }

      setDeleteOpen(false)
      setDeleteTargetId(null)
      setActionMessage('Conversa excluída.')
      void loadConversations()
    } catch (error) {
      setActionMessage(handleSessionError(error, 'Não foi possível excluir esta conversa.'))
    } finally {
      setDeletingId(null)
    }
  }

  function selectFilter(nextFilter: ConversationFilter) {
    setFilter(nextFilter)
    navigate('/atendimento')
  }

  const typingLabel = conversationId && typingByConversation[conversationId]
    ? `${typingByConversation[conversationId]} está digitando...`
    : ''

  const elevated = canTransfer(user?.role)
  const membersAllowed = canManageMembers(user?.role)
  const closeAllowed = canCloseConversation(user?.role)
  const archiveAllowed = closeAllowed
  const deleteAllowed = elevated
  const deleteTarget = deleteTargetId
    ? selectedConversation?.id === deleteTargetId
      ? selectedConversation
      : conversations.find((conversation) => conversation.id === deleteTargetId)
    : null
  const homeAttendanceActive = attendanceStartedAt !== null
  const waitingTickets = homeAttendanceActive ? counts?.new ?? 0 : 0
  const currentTimeLabel = formatClock(slaNow)
  const attendanceElapsed = formatElapsedTime(attendanceStartedAt, sessionNow)
  const notificationPermissionLabel = homeAttendanceActive
    ? getNotificationPermissionLabel(notifier.notificationPermission)
    : 'Serão solicitadas'
  const showAttendanceHome = !homeAttendanceActive && !conversationId

  function toggleHomeSetting(key: keyof AttendanceHomeSettings) {
    setHomeSettings((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function openQueueWorkspace() {
    if (!homeAttendanceActive) {
      setActionMessage('Inicie o atendimento para abrir o Desk.')
      return
    }

    navigate('/atendimento')
  }

  function navigateFromHome(path: string) {
    if (path === '/atendimento') {
      navigate(path)
      return
    }

    navigate(path)
  }

  function activateAttendanceSession(startedAt = Date.now()) {
    if (!user) return

    persistAttendanceSession(user.id, startedAt)
    setAttendanceStartedAt(startedAt)
    setSessionNow(Date.now())
  }

  function deactivateAttendanceSession(userId = user?.id) {
    if (!userId) return

    clearAttendanceSession(userId)
    setAttendanceStartedAt(null)
    setSessionNow(Date.now())
  }

  function handleLogout() {
    deactivateAttendanceSession()
    void logout()
  }

  async function endAttendanceSession() {
    const stopped = await updateOwnAttendanceStatus('INVISIBLE')
    if (!stopped) return

    navigate('/atendimento')
    setActionMessage('Atendimento encerrado.')
  }

  async function startAttendance() {
    if (!user || attendanceStatusUpdating) return

    setActionMessage('')

    if (attendanceStartedAt) {
      setSessionNow(Date.now())
      setActionMessage('Atendimento já iniciado.')
      void loadConversations()
      void loadAgents(true)
      return
    }

    if (notifier.notificationPermission === 'default') {
      await notifier.requestNotificationPermission()
    }

    if (
      !notifier.soundEnabled &&
      (homeSettings.newAttendanceSound || homeSettings.newMessageSound)
    ) {
      notifier.toggleSound()
    }

    const statusReady = await updateOwnAttendanceStatus('AVAILABLE')
    if (!statusReady) return

    if (connectionState === 'idle' || connectionState === 'disconnected') {
      chatSocket.connect({ agentId: user.id })
    }

    activateAttendanceSession()
    setActionMessage('Atendimento iniciado.')
    void loadConversations()
    void loadAgents(true)
  }

  if (!user) return null

  if (showAttendanceHome) {
    return (
      <>
        <AttendanceHome
          user={user}
          currentTimeLabel={currentTimeLabel}
          elapsed={attendanceElapsed}
          waitingTickets={waitingTickets}
          notificationsLabel={notificationPermissionLabel}
          theme={theme}
          active={homeAttendanceActive}
          starting={attendanceStatusUpdating}
          settings={homeSettings}
          onStart={() => void startAttendance()}
          onToggleSetting={toggleHomeSetting}
          onNavigate={navigateFromHome}
          onOpenQueue={openQueueWorkspace}
          onToggleTheme={toggleTheme}
          onUnavailable={() => setActionMessage('Configurações ainda não estão disponíveis.')}
          onOpenMacrosAdmin={() => setMacroAdminOpen(true)}
          onLogout={handleLogout}
        />

        {actionMessage && (
          <div className="toast" role="status">
            {actionMessage}
          </div>
        )}

        {canManageMacros(user.role) && (
          <MacroAdminDialog
            open={macroAdminOpen}
            macros={macros}
            loading={macrosLoading}
            onClose={() => setMacroAdminOpen(false)}
            onReload={reloadMacros}
          />
        )}
      </>
    )
  }

  return (
    <>
      <AttendanceDesk
        user={user}
        active={homeAttendanceActive}
        elapsed={attendanceElapsed}
        theme={theme}
        waitingTickets={waitingTickets}
        channelStatusLabel="Witcom - Online"
        conversations={displayedConversations}
        selectedId={conversationId}
        search={search}
        filter={filter}
        loading={listLoading}
        error={listError}
        onSearchChange={setSearch}
        onFilterChange={selectFilter}
        onSelect={(nextConversationId) => navigate(`/atendimento/${nextConversationId}`)}
        onRetry={() => void loadConversations()}
        onNavigate={navigateFromHome}
        onEndSession={() => void endAttendanceSession()}
        onToggleTheme={toggleTheme}
        onOpenMacrosAdmin={() => setMacroAdminOpen(true)}
        onLogout={handleLogout}
        ticketPanelOpen={ticketPanelOpen}
        onToggleTicketPanel={() => {
          setTicketPanelOpen((open) => {
            const next = !open
            persistTicketPanelOpen(next)
            return next
          })
        }}
      >
        {conversationId ? (
          <ChatPanel
            conversation={selectedConversation}
            messages={displayedMessages}
            notes={notes}
            quickReplies={quickReplies}
            macros={macros}
            recentMacros={recentMacros}
            favoriteMacroIds={favoriteMacroIds}
            onTriggerMacro={handleTriggerMacro}
            loading={messagesLoading}
            error={messageError}
            hasMore={hasMoreMessages}
            typingLabel={typingLabel}
            now={slaNow}
            sendingDisabled={false}
            canTransfer={elevated}
            canClose={closeAllowed}
            canArchive={archiveAllowed}
            canDelete={deleteAllowed}
            statusUpdating={statusUpdating}
            archiveUpdating={Boolean(conversationId && archiveActionId === conversationId)}
            tagsUpdating={tagsUpdating}
            noteSubmitting={noteSubmitting}
            currentAgentName={currentAgentName}
            onAddNote={(note) => void addNote(note)}
            onLoadOlder={() => void loadOlderMessages()}
            onSend={handleSend}
            onRetry={retryMessage}
            onTypingStart={() => {
              if (conversationId) {
                chatSocket.emit('typing_start', {
                  conversation_id: conversationId,
                  conversationId,
                })
              }
            }}
            onTypingStop={() => {
              if (conversationId) {
                chatSocket.emit('typing_stop', {
                  conversation_id: conversationId,
                  conversationId,
                })
              }
            }}
            onStatusChange={(status) => void updateStatus(status)}
            onArchive={() => {
              if (conversationId) void archiveConversation(conversationId)
            }}
            onRestore={() => {
              if (conversationId) void restoreConversation(conversationId)
            }}
            onTagsChange={(tags) => void updateConversationTags(tags)}
            onOpenTransfer={() => void openTransferDialog()}
            onOpenClose={() => setCloseOpen(true)}
            onOpenDelete={() => {
              if (conversationId) openDeleteDialog(conversationId)
            }}
            onRetryLoad={() => {
              if (conversationId) void loadSelectedConversation(conversationId)
            }}
          />
        ) : (
          <AttendanceDeskWelcome />
        )}
      </AttendanceDesk>

      {actionMessage && (
        <div className="toast" role="status">
          {actionMessage}
        </div>
      )}

      <TransferDialog
        open={transferOpen}
        agents={agents}
        loading={transferLoading}
        onCancel={() => setTransferOpen(false)}
        onConfirm={(agentId) => void transferConversation(agentId)}
      />

      <CloseConversationDialog
        open={closeOpen}
        loading={statusUpdating}
        onCancel={() => setCloseOpen(false)}
        onConfirm={(reason, note) => void closeConversation(reason, note)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Excluir conversa"
        message={`Deseja realmente excluir a conversa de ${
          deleteTarget?.customerName ?? 'este cliente'
        }? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loadingLabel="Excluindo..."
        loading={deletingId !== null}
        onCancel={() => {
          setDeleteOpen(false)
          setDeleteTargetId(null)
        }}
        onConfirm={() => void deleteConversation()}
      />

      <GlobalSearch
        open={searchOpen}
        conversations={conversations}
        onClose={() => setSearchOpen(false)}
        onSelect={(nextConversationId) => {
          setSearchOpen(false)
          navigate(`/atendimento/${nextConversationId}`)
        }}
      />

      <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {membersAllowed && (
        <QuickRepliesAdminDialog
          open={quickRepliesAdminOpen}
          onClose={() => {
            setQuickRepliesAdminOpen(false)
            quickRepliesApi
              .list()
              .then(setQuickReplies)
              .catch(() => setQuickReplies([]))
          }}
        />
      )}

      <MacroExecutionModal
        macro={pendingMacro}
        onCancel={() => setPendingMacro(null)}
        onConfirm={confirmMacroExecution}
      />

      <MacroExecutionProgress
        state={macroExecution.state}
        pendingGate={macroExecution.pendingGate}
        onConfirmStep={macroExecution.confirmStep}
        onResolveError={macroExecution.resolveError}
        onCancel={macroExecution.cancel}
        onClose={macroExecution.reset}
      />

      {canManageMacros(user?.role) && (
        <MacroAdminDialog
          open={macroAdminOpen}
          macros={macros}
          loading={macrosLoading}
          onClose={() => setMacroAdminOpen(false)}
          onReload={reloadMacros}
        />
      )}
    </>
  )
}
