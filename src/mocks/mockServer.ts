import {
  ApiError,
  UnauthorizedError,
  setAccessToken,
} from '../services/api/httpClient'
import type {
  AgentOption,
  AgentRole,
  AgentUser,
  AudienceEstimate,
  AuditLogEntry,
  AuthLoginResponse,
  AttendanceStatus,
  Campaign,
  CampaignAudienceFilter,
  ConversationCloseReason,
  ConversationCounts,
  ConversationDetail,
  ConversationFilter,
  ConversationNote,
  ConversationQueueSort,
  ConversationStatus,
  ConversationPriority,
  ConversationSummary,
  ConversationTag,
  ConversationTagFilter,
  CustomerSearchResult,
  LoginCredentials,
  Message,
  MonitoringAgent,
  MonitoringOverview,
  MonitoringQueue,
  PaginatedResponse,
  QuickReply,
  Sale,
  SaleStatus,
  SaleSummary,
  StartCustomerChatResponse,
  UserStatusChangedPayload,
} from '../types/domain'
import type { Macro, MacroInput, MacroQueueOption } from '../types/macro'
import type {
  Automation,
  AutomationExecution,
  AutomationInput,
  AutomationPreviewInput,
} from '../types/automation'
import type { QuickReplyInput } from '../services/api/quickRepliesApi'
import type { MacroExecutionHandle } from '../services/api/macrosApi'
import type { AutomationTestResult } from '../services/api/automationsApi'
import type { CampaignInput } from '../services/api/campaignsApi'
import type { CreateSaleInput } from '../services/api/salesApi'
import { getCloseReasonLabel } from '../utils/closeReasons'
import { applyConversationQueueView } from '../utils/conversationQueue'
import { getConversationTagLabel } from '../utils/conversationTags'
import { normalizeCpf } from '../utils/cpf'
import { buildAutomationPreview } from '../utils/automationPreview'

const now = Date.now()

const agents: AgentOption[] = [
  {
    id: 'agent-lucas',
    name: 'Lucas Almeida',
    email: 'lucas@example.com',
    role: 'attendant',
    attendanceStatus: 'AVAILABLE',
    attendanceStatusChangedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
    presence: 'online',
    online: true,
  },
  {
    id: 'agent-marina',
    name: 'Marina Costa',
    email: 'marina@example.com',
    role: 'supervisor',
    attendanceStatus: 'AVAILABLE',
    attendanceStatusChangedAt: new Date(now - 84 * 60_000).toISOString(),
    presence: 'online',
    online: true,
  },
  {
    id: 'agent-ana',
    name: 'Ana Ribeiro',
    email: 'ana@example.com',
    role: 'attendant',
    attendanceStatus: 'INVISIBLE',
    attendanceStatusChangedAt: new Date(now - 32 * 60_000).toISOString(),
    presence: 'offline',
    online: false,
  },
  {
    id: 'agent-ramon',
    name: 'Ramon Pereira',
    email: 'ramon@example.com',
    role: 'admin',
    attendanceStatus: 'AVAILABLE',
    attendanceStatusChangedAt: new Date(now - 3 * 60 * 60_000).toISOString(),
    presence: 'online',
    online: true,
  },
]

let currentUser: AgentUser | null = null

interface UserStatusLog {
  id: string
  userId: string
  oldStatus: AttendanceStatus
  newStatus: AttendanceStatus
  changedBy: string
  createdAt: string
}

type UserStatusListener = (payload: UserStatusChangedPayload) => void

const userStatusLogs: UserStatusLog[] = []
const userStatusListeners = new Set<UserStatusListener>()

let conversations: ConversationSummary[] = [
  {
    id: 'conv-18452',
    status: 'new',
    customerName: 'João Silva',
    subject: 'Sem conexão',
    ticketNumber: '18452',
    tags: ['no_connection'],
    unreadCount: 2,
    lastMessage: 'Minha LOS está vermelha e a internet caiu.',
    lastMessageAt: new Date(now - 60_000).toISOString(),
    lastCustomerMessageAt: new Date(now - 60_000).toISOString(),
    waitingSince: new Date(now - 60_000).toISOString(),
    createdAt: new Date(now - 28 * 60_000).toISOString(),
    updatedAt: new Date(now - 60_000).toISOString(),
    customer: {
      name: 'João Silva',
      contractNumber: '12884',
      document: '12345678942',
      plan: '700 Mega',
      ticketNumber: '18452',
      reason: 'Sem conexão',
      sgpStatus: 'Aberto',
      openedAt: new Date(now - 28 * 60_000).toISOString(),
      visit: {
        dateLabel: 'Hoje',
        timeWindow: '14:00 - 16:00',
        technicianName: 'Ainda não definido',
      },
    },
  },
  {
    id: 'conv-18431',
    status: 'open',
    customerName: 'Maria Oliveira',
    subject: 'Internet lenta',
    ticketNumber: '18431',
    tags: ['slowness', 'wifi'],
    assignedAgentId: 'agent-lucas',
    assignedAgentName: 'Lucas Almeida',
    unreadCount: 0,
    lastMessage: 'Obrigada, vou testar novamente.',
    lastMessageAt: new Date(now - 7 * 60_000).toISOString(),
    lastCustomerMessageAt: new Date(now - 7 * 60_000).toISOString(),
    waitingSince: new Date(now - 7 * 60_000).toISOString(),
    createdAt: new Date(now - 84 * 60_000).toISOString(),
    updatedAt: new Date(now - 7 * 60_000).toISOString(),
    customer: {
      name: 'Maria Oliveira',
      contractNumber: '11902',
      document: '52998224725',
      plan: '500 Mega',
      ticketNumber: '18431',
      reason: 'Internet lenta',
      sgpStatus: 'Aberto',
      openedAt: new Date(now - 84 * 60_000).toISOString(),
    },
  },
  {
    id: 'conv-18398',
    status: 'waiting_customer',
    customerName: 'Carlos Souza',
    subject: 'Visita técnica',
    ticketNumber: '18398',
    tags: ['visit'],
    assignedAgentId: 'agent-lucas',
    assignedAgentName: 'Lucas Almeida',
    unreadCount: 1,
    lastMessage: 'Chego em casa depois das 18h.',
    lastMessageAt: new Date(now - 18 * 60_000).toISOString(),
    lastCustomerMessageAt: new Date(now - 18 * 60_000).toISOString(),
    createdAt: new Date(now - 2 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 18 * 60_000).toISOString(),
    customer: {
      name: 'Carlos Souza',
      contractNumber: '13014',
      plan: '900 Mega',
      ticketNumber: '18398',
      reason: 'Visita técnica',
      sgpStatus: 'Agendado',
      openedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
      visit: {
        dateLabel: 'Amanhã',
        timeWindow: '08:00 - 10:00',
        technicianName: 'Rafael Mendes',
      },
    },
  },
  {
    id: 'conv-18344',
    status: 'closed',
    customerName: 'Fernanda Lima',
    subject: 'Segunda via',
    ticketNumber: '18344',
    tags: ['billing'],
    assignedAgentId: 'agent-marina',
    assignedAgentName: 'Marina Costa',
    unreadCount: 0,
    lastMessage: 'Atendimento encerrado.',
    lastMessageAt: new Date(now - 7 * 60 * 60_000).toISOString(),
    closedAt: new Date(now - 7 * 60 * 60_000).toISOString(),
    closeReason: 'resolved',
    createdAt: new Date(now - 9 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 7 * 60 * 60_000).toISOString(),
    customer: {
      name: 'Fernanda Lima',
      contractNumber: '10458',
      plan: '400 Mega',
      ticketNumber: '18344',
      reason: 'Segunda via',
      sgpStatus: 'Resolvido',
      openedAt: new Date(now - 9 * 60 * 60_000).toISOString(),
    },
  },
  {
    id: 'conv-18270',
    status: 'closed',
    customerName: 'Paulo Mendes',
    subject: 'Troca de titularidade',
    ticketNumber: '18270',
    tags: ['cancellation'],
    assignedAgentId: 'agent-marina',
    assignedAgentName: 'Marina Costa',
    unreadCount: 0,
    lastMessage: 'Conversa arquivada.',
    lastMessageAt: new Date(now - 26 * 60 * 60_000).toISOString(),
    closedAt: new Date(now - 26 * 60 * 60_000).toISOString(),
    closeReason: 'duplicate',
    archivedAt: new Date(now - 22 * 60 * 60_000).toISOString(),
    createdAt: new Date(now - 28 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 22 * 60 * 60_000).toISOString(),
    customer: {
      name: 'Paulo Mendes',
      contractNumber: '10177',
      plan: '300 Mega',
      ticketNumber: '18270',
      reason: 'Troca de titularidade',
      sgpStatus: 'Resolvido',
      openedAt: new Date(now - 28 * 60 * 60_000).toISOString(),
    },
  },
]

const mockCustomers = [
  {
    cpf: '52998224725',
    customer: {
      id: 'customer-maria',
      name: 'Maria Oliveira',
      phone: '(11) 99999-1190',
    },
    contracts: [
      {
        id: '11902',
        planName: '500 Mega',
        status: 'Ativo',
        addressLine: 'Rua das Flores, 180',
        city: 'São Paulo',
        state: 'SP',
      },
    ],
  },
  {
    cpf: '11144477735',
    customer: {
      id: 'customer-ana-cliente',
      name: 'Ana Ribeiro Cliente',
      phone: '(11) 99999-1422',
    },
    contracts: [
      {
        id: '14220',
        planName: '700 Mega',
        status: 'Ativo',
        addressLine: 'Avenida Central, 420',
        city: 'São Paulo',
        state: 'SP',
      },
    ],
  },
]

const messages = new Map<string, Message[]>([
  [
    'conv-18452',
    [
      {
        id: 'msg-18452-1',
        conversationId: 'conv-18452',
        authorType: 'customer',
        authorName: 'João Silva',
        body: 'Minha internet continua sem funcionar.',
        createdAt: new Date(now - 3 * 60_000).toISOString(),
        status: 'sent',
      },
      {
        id: 'msg-18452-2',
        conversationId: 'conv-18452',
        authorType: 'customer',
        authorName: 'João Silva',
        body: 'Minha LOS está vermelha e a internet caiu.',
        createdAt: new Date(now - 60_000).toISOString(),
        status: 'sent',
      },
    ],
  ],
  [
    'conv-18431',
    [
      {
        id: 'msg-18431-1',
        conversationId: 'conv-18431',
        authorType: 'system',
        authorName: 'Sistema',
        body: 'Lucas Almeida assumiu este atendimento.',
        createdAt: new Date(now - 74 * 60_000).toISOString(),
        status: 'sent',
      },
      {
        id: 'msg-18431-2',
        conversationId: 'conv-18431',
        authorType: 'agent',
        senderId: 'agent-lucas',
        authorName: 'Lucas Almeida',
        body: 'Vou verificar seu sinal e retorno em instantes.',
        createdAt: new Date(now - 9 * 60_000).toISOString(),
        status: 'sent',
      },
      {
        id: 'msg-18431-3',
        conversationId: 'conv-18431',
        authorType: 'customer',
        authorName: 'Maria Oliveira',
        body: 'Obrigada, vou testar novamente.',
        createdAt: new Date(now - 7 * 60_000).toISOString(),
        status: 'sent',
      },
    ],
  ],
  [
    'conv-18398',
    [
      {
        id: 'msg-18398-1',
        conversationId: 'conv-18398',
        authorType: 'agent',
        senderId: 'agent-lucas',
        authorName: 'Lucas Almeida',
        body: 'Podemos agendar uma visita técnica para hoje à tarde?',
        createdAt: new Date(now - 35 * 60_000).toISOString(),
        status: 'sent',
      },
      {
        id: 'msg-18398-2',
        conversationId: 'conv-18398',
        authorType: 'customer',
        authorName: 'Carlos Souza',
        body: 'Chego em casa depois das 18h.',
        createdAt: new Date(now - 18 * 60_000).toISOString(),
        status: 'sent',
      },
    ],
  ],
  [
    'conv-18344',
    [
      {
        id: 'msg-18344-1',
        conversationId: 'conv-18344',
        authorType: 'system',
        authorName: 'Sistema',
        body: 'Atendimento encerrado.',
        createdAt: new Date(now - 7 * 60 * 60_000).toISOString(),
        status: 'sent',
      },
    ],
  ],
  [
    'conv-18270',
    [
      {
        id: 'msg-18270-1',
        conversationId: 'conv-18270',
        authorType: 'system',
        authorName: 'Sistema',
        body: 'Atendimento encerrado: Duplicado.',
        createdAt: new Date(now - 26 * 60 * 60_000).toISOString(),
        status: 'sent',
      },
      {
        id: 'msg-18270-2',
        conversationId: 'conv-18270',
        authorType: 'system',
        authorName: 'Sistema',
        body: 'Conversa arquivada.',
        createdAt: new Date(now - 22 * 60 * 60_000).toISOString(),
        status: 'sent',
      },
    ],
  ],
])

const conversationNotes = new Map<string, ConversationNote[]>()

let quickReplies: QuickReply[] = [
  {
    id: 'qr-los',
    shortcut: '/los',
    title: 'Verificar LOS',
    body: 'Poderia verificar se a luz LOS do seu equipamento está vermelha ou piscando?',
    category: 'Técnico',
    active: true,
    createdBy: null,
    createdAt: new Date(now - 30 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 30 * 24 * 60 * 60_000).toISOString(),
  },
  {
    id: 'qr-reiniciar',
    shortcut: '/reiniciar',
    title: 'Reiniciar equipamento',
    body: 'Peço que desligue o roteador da tomada, aguarde 30 segundos e ligue novamente.',
    category: 'Técnico',
    active: true,
    createdBy: null,
    createdAt: new Date(now - 30 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 30 * 24 * 60 * 60_000).toISOString(),
  },
  {
    id: 'qr-boleto',
    shortcut: '/boleto',
    title: 'Segunda via de boleto',
    body: 'Vou verificar a segunda via do seu boleto, um momento por favor.',
    category: 'Financeiro',
    active: true,
    createdBy: null,
    createdAt: new Date(now - 30 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 30 * 24 * 60 * 60_000).toISOString(),
  },
  {
    id: 'qr-visita',
    shortcut: '/visita',
    title: 'Confirmar visita técnica',
    body: 'Sua visita técnica está agendada, um de nossos técnicos irá até você no período informado.',
    category: 'Técnico',
    active: true,
    createdBy: null,
    createdAt: new Date(now - 30 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 30 * 24 * 60 * 60_000).toISOString(),
  },
]

// Macros de atendimento (mock). Reflete os exemplos do pedido de produto:
// /semnet é o fluxo completo com CONDITION + API_REQUEST; os demais são mais simples.
let macros: Macro[] = [
  {
    id: 'macro-sem-internet',
    name: 'Cliente sem conexão',
    description: 'Diagnóstico inicial e resposta para clientes sem internet.',
    shortcut: '/semnet',
    category: 'Suporte',
    enabled: true,
    createdAt: new Date(now - 20 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 20 * 24 * 60 * 60_000).toISOString(),
    actions: [
      { id: 'semnet-1', type: 'SEND_MESSAGE', text: 'Vou verificar sua conexão. Isso pode levar alguns instantes.' },
      { id: 'semnet-2', type: 'ADD_TAG', tag: 'no_connection' },
      { id: 'semnet-3', type: 'SET_PRIORITY', priority: 'high' },
      {
        id: 'semnet-4',
        type: 'API_REQUEST',
        key: 'connectionStatus',
        operation: 'customerDiagnostic.connectionStatus',
      },
      {
        id: 'semnet-5',
        type: 'API_REQUEST',
        key: 'regionalIncident',
        operation: 'customerDiagnostic.regionalIncident',
      },
      {
        id: 'semnet-6',
        type: 'CONDITION',
        condition: { variable: 'regionalIncident.affected', operator: 'EQUALS', value: true },
        then: [
          {
            id: 'semnet-6-then-1',
            type: 'SEND_MESSAGE',
            text: 'Identificamos uma instabilidade na sua região. Nossa equipe técnica já está trabalhando para normalizar o serviço.',
          },
          {
            id: 'semnet-6-then-2',
            type: 'ADD_INTERNAL_NOTE',
            text: 'Incidente regional identificado automaticamente.',
          },
        ],
        else: [
          {
            id: 'semnet-6-else-1',
            type: 'SEND_MESSAGE',
            text: 'Não identificamos uma falha geral na região. Vamos continuar os testes da sua conexão.',
          },
          {
            id: 'semnet-6-else-2',
            type: 'ADD_INTERNAL_NOTE',
            text: 'ONU: {{connectionStatus.onu}}\nPPPoE: {{connectionStatus.pppoe}}\nSinal: {{connectionStatus.opticalSignal}}',
          },
        ],
      },
      {
        id: 'semnet-7',
        type: 'TRANSFER_QUEUE',
        queue: 'SUPORTE_N2',
        onError: 'CONTINUE',
        confirm: {
          title: 'Transferir para o Suporte N2?',
          description: 'Use apenas se o diagnóstico indicar necessidade de suporte avançado. Clique em "Continuar atendimento" para não transferir.',
          confirmLabel: 'Transferir para N2',
          skipLabel: 'Continuar atendimento',
        },
      },
    ],
  },
  {
    id: 'macro-lentidao',
    name: 'Internet lenta',
    description: 'Mensagem inicial e categorização para reclamações de lentidão.',
    shortcut: '/lentidao',
    category: 'Suporte',
    enabled: true,
    createdAt: new Date(now - 18 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 18 * 24 * 60 * 60_000).toISOString(),
    actions: [
      {
        id: 'lentidao-1',
        type: 'SEND_MESSAGE',
        text: 'Vou verificar o desempenho da sua conexão, um momento por favor.',
      },
      { id: 'lentidao-2', type: 'ADD_TAG', tag: 'slowness' },
      { id: 'lentidao-3', type: 'SET_PRIORITY', priority: 'medium' },
      { id: 'lentidao-4', type: 'ADD_INTERNAL_NOTE', text: 'Cliente reportou lentidão — aguardando diagnóstico.' },
    ],
  },
  {
    id: 'macro-segunda-via',
    name: 'Segunda via da fatura',
    description: 'Fluxo padrão para solicitação de segunda via de fatura.',
    shortcut: '/segunda-via',
    category: 'Financeiro',
    enabled: true,
    createdAt: new Date(now - 18 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 18 * 24 * 60 * 60_000).toISOString(),
    actions: [
      { id: 'segundavia-1', type: 'SEND_MESSAGE', text: 'Vou gerar a segunda via da sua fatura, um momento.' },
      { id: 'segundavia-2', type: 'ADD_TAG', tag: 'billing' },
    ],
  },
  {
    id: 'macro-troca-senha',
    name: 'Alteração de senha Wi-Fi',
    description: 'Orientações para troca de senha da rede Wi-Fi.',
    shortcut: '/troca-senha',
    category: 'Suporte',
    enabled: true,
    createdAt: new Date(now - 15 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 15 * 24 * 60 * 60_000).toISOString(),
    actions: [
      {
        id: 'trocasenha-1',
        type: 'SEND_MESSAGE',
        text: 'Vou te ajudar a alterar a senha do seu Wi-Fi. Pode me confirmar o nome da rede atual?',
      },
      { id: 'trocasenha-2', type: 'ADD_TAG', tag: 'wifi' },
    ],
  },
  {
    id: 'macro-visita',
    name: 'Solicitar visita técnica',
    description: 'Abertura de solicitação de visita técnica.',
    shortcut: '/visita',
    category: 'Suporte',
    enabled: true,
    createdAt: new Date(now - 12 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 12 * 24 * 60 * 60_000).toISOString(),
    actions: [
      {
        id: 'visita-1',
        type: 'SEND_MESSAGE',
        text: 'Vou abrir uma solicitação de visita técnica para o seu endereço.',
      },
      { id: 'visita-2', type: 'ADD_TAG', tag: 'visit' },
      { id: 'visita-3', type: 'ADD_INTERNAL_NOTE', text: 'Visita técnica solicitada via macro.' },
    ],
  },
  {
    id: 'macro-cancelamento',
    name: 'Solicitação de cancelamento',
    description: 'Fluxo inicial de retenção para pedidos de cancelamento.',
    shortcut: '/cancelamento',
    category: 'Retenção',
    enabled: true,
    createdAt: new Date(now - 10 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 10 * 24 * 60 * 60_000).toISOString(),
    actions: [
      {
        id: 'cancelamento-1',
        type: 'SEND_MESSAGE',
        text: 'Lamento saber que você está pensando em cancelar. Vou entender melhor o motivo para te ajudar.',
      },
      { id: 'cancelamento-2', type: 'ADD_TAG', tag: 'cancellation' },
      { id: 'cancelamento-3', type: 'SET_PRIORITY', priority: 'high' },
      {
        id: 'cancelamento-4',
        type: 'TRANSFER_QUEUE',
        queue: 'RETENCAO',
        confirm: {
          title: 'Transferir para a equipe de Retenção?',
          confirmLabel: 'Transferir',
          skipLabel: 'Continuar atendimento',
        },
      },
    ],
  },
]

// Resolução de "fila" → atendente real (ver macrosApi.listQueues — endpoint pendente de backend).
const macroQueues: MacroQueueOption[] = [
  { id: 'SUPORTE_N2', label: 'Suporte N2', agentId: 'agent-marina' },
  { id: 'RETENCAO', label: 'Retenção', agentId: 'agent-ramon' },
]

let macroIdCounter = macros.length + 1

function cloneMacro(macro: Macro): Macro {
  return JSON.parse(JSON.stringify(macro)) as Macro
}

// Automações (mock). Reflete os 5 exemplos do pedido de produto: sem internet
// (com CONDITION inline + API_OPERATION), segunda via, inatividade do
// cliente, SLA e risco de cancelamento.
let automations: Automation[] = [
  {
    id: 'automation-sem-internet',
    name: 'Classificar cliente sem conexão',
    description: 'Identifica mensagens indicando falta de conexão, classifica o atendimento e verifica incidente regional.',
    status: 'ACTIVE',
    priority: 1,
    stopProcessing: false,
    trigger: { type: 'MESSAGE_RECEIVED' },
    conditionGroups: [
      {
        id: 'semnet-group-1',
        operator: 'OR',
        conditions: [
          { id: 'semnet-cond-1', field: 'message.text', operator: 'CONTAINS', value: 'sem internet' },
          { id: 'semnet-cond-2', field: 'message.text', operator: 'CONTAINS', value: 'sem conexão' },
          { id: 'semnet-cond-3', field: 'message.text', operator: 'CONTAINS', value: 'caiu' },
          { id: 'semnet-cond-4', field: 'message.text', operator: 'CONTAINS', value: 'offline' },
          { id: 'semnet-cond-5', field: 'message.text', operator: 'CONTAINS', value: 'sem sinal' },
          { id: 'semnet-cond-6', field: 'message.text', operator: 'CONTAINS', value: 'não conecta' },
        ],
      },
    ],
    actions: [
      { id: 'semnet-act-1', type: 'ADD_TAG', tag: 'no_connection' },
      { id: 'semnet-act-2', type: 'SET_PRIORITY', priority: 'high' },
      {
        id: 'semnet-act-3',
        type: 'API_OPERATION',
        operation: 'customerDiagnostic.regionalIncident',
        resultKey: 'regionalIncident',
      },
      {
        id: 'semnet-act-4',
        type: 'CONDITION',
        condition: { id: 'semnet-inline-cond', field: 'regionalIncident.affected', operator: 'EQUALS', value: true },
        then: [
          {
            id: 'semnet-then-1',
            type: 'SEND_MESSAGE',
            text: 'Identificamos uma instabilidade na sua região. Nossa equipe técnica já está trabalhando para normalizar o serviço.',
          },
          { id: 'semnet-then-2', type: 'ADD_INTERNAL_NOTE', text: 'Incidente regional identificado automaticamente.' },
        ],
        else: [
          { id: 'semnet-else-1', type: 'SEND_MESSAGE', text: 'Vou realizar alguns testes na sua conexão.' },
          {
            id: 'semnet-else-2',
            type: 'API_OPERATION',
            operation: 'customerDiagnostic.connectionStatus',
            resultKey: 'connectionStatus',
          },
        ],
      },
    ],
    metrics: { executionsToday: 127, failuresToday: 2, successRatePercent: 98.4, lastExecutionAt: new Date(now - 2 * 60_000).toISOString() },
    createdAt: new Date(now - 20 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 20 * 24 * 60 * 60_000).toISOString(),
  },
  {
    id: 'automation-segunda-via',
    name: 'Segunda via de fatura',
    description: 'Classifica pedidos financeiros e consulta faturas em aberto.',
    status: 'DRAFT',
    priority: 2,
    stopProcessing: false,
    trigger: { type: 'MESSAGE_RECEIVED' },
    conditionGroups: [
      {
        id: 'segvia-group-1',
        operator: 'OR',
        conditions: [
          { id: 'segvia-cond-1', field: 'message.text', operator: 'CONTAINS', value: 'boleto' },
          { id: 'segvia-cond-2', field: 'message.text', operator: 'CONTAINS', value: 'fatura' },
          { id: 'segvia-cond-3', field: 'message.text', operator: 'CONTAINS', value: 'segunda via' },
          { id: 'segvia-cond-4', field: 'message.text', operator: 'CONTAINS', value: '2 via' },
          { id: 'segvia-cond-5', field: 'message.text', operator: 'CONTAINS', value: 'pix' },
          { id: 'segvia-cond-6', field: 'message.text', operator: 'CONTAINS', value: 'conta' },
          { id: 'segvia-cond-7', field: 'message.text', operator: 'CONTAINS', value: 'pagamento' },
        ],
      },
    ],
    actions: [
      { id: 'segvia-act-1', type: 'ADD_TAG', tag: 'billing' },
      { id: 'segvia-act-2', type: 'API_OPERATION', operation: 'billing.getOpenInvoices', resultKey: 'invoices' },
      {
        id: 'segvia-act-3',
        type: 'CONDITION',
        condition: { id: 'segvia-inline-cond', field: 'invoices.hasOpen', operator: 'EQUALS', value: true },
        then: [
          {
            id: 'segvia-then-1',
            type: 'SEND_MESSAGE',
            text: 'Localizamos uma fatura em aberto. Vou te enviar os dados para pagamento.',
          },
        ],
        else: [
          {
            id: 'segvia-else-1',
            type: 'SEND_MESSAGE',
            text: 'Não encontramos faturas em aberto no momento. Posso ajudar com outra coisa?',
          },
        ],
      },
    ],
    metrics: { executionsToday: 0, failuresToday: 0, successRatePercent: null, lastExecutionAt: null },
    createdAt: new Date(now - 6 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 6 * 24 * 60 * 60_000).toISOString(),
  },
  {
    id: 'automation-inatividade',
    name: 'Encerrar atendimento por inatividade',
    description: 'Envia lembretes escalonados e encerra o atendimento se o cliente continuar sem responder.',
    status: 'ACTIVE',
    priority: 5,
    stopProcessing: true,
    trigger: { type: 'CUSTOMER_INACTIVE', minutes: 10 },
    conditionGroups: [],
    actions: [
      { id: 'inativ-act-1', type: 'SEND_MESSAGE', text: 'Olá! Ainda está por aí? Posso continuar te ajudando?' },
      { id: 'inativ-act-2', type: 'WAIT', ms: 10 * 60_000 },
      {
        id: 'inativ-act-3',
        type: 'SEND_MESSAGE',
        text: 'Ainda não recebemos sua resposta. Se precisar de ajuda, estou por aqui.',
      },
      { id: 'inativ-act-4', type: 'WAIT', ms: 10 * 60_000 },
      {
        id: 'inativ-act-5',
        type: 'SEND_MESSAGE',
        text: 'Como não tivemos retorno, este atendimento será encerrado. Se precisar, é só iniciar uma nova conversa.',
      },
      {
        id: 'inativ-act-6',
        type: 'CLOSE_TICKET',
        closeReason: 'no_customer_response',
        note: 'Encerrado automaticamente por inatividade do cliente.',
      },
    ],
    metrics: { executionsToday: 34, failuresToday: 0, successRatePercent: 100, lastExecutionAt: new Date(now - 12 * 60_000).toISOString() },
    createdAt: new Date(now - 15 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 15 * 24 * 60 * 60_000).toISOString(),
  },
  {
    id: 'automation-sla',
    name: 'SLA próximo do limite',
    description: 'Eleva a prioridade e registra um alerta quando o tempo de espera do cliente se aproxima do limite de SLA.',
    status: 'ACTIVE',
    priority: 3,
    stopProcessing: false,
    trigger: { type: 'SLA_WARNING', thresholdPercent: 80 },
    conditionGroups: [],
    actions: [
      { id: 'sla-act-1', type: 'SET_PRIORITY', priority: 'high' },
      { id: 'sla-act-2', type: 'ADD_INTERNAL_NOTE', text: 'SLA em 80% do limite — supervisor notificado automaticamente.' },
    ],
    metrics: { executionsToday: 9, failuresToday: 1, successRatePercent: 88.9, lastExecutionAt: new Date(now - 40 * 60_000).toISOString() },
    createdAt: new Date(now - 10 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 10 * 24 * 60 * 60_000).toISOString(),
  },
  {
    id: 'automation-cancelamento',
    name: 'Risco de cancelamento',
    description: 'Identifica pedidos de cancelamento, eleva a prioridade e encaminha para a equipe de retenção.',
    status: 'PAUSED',
    priority: 2,
    stopProcessing: false,
    trigger: { type: 'MESSAGE_RECEIVED' },
    conditionGroups: [
      {
        id: 'cancel-group-1',
        operator: 'OR',
        conditions: [
          { id: 'cancel-cond-1', field: 'message.text', operator: 'CONTAINS', value: 'cancelar internet' },
          { id: 'cancel-cond-2', field: 'message.text', operator: 'CONTAINS', value: 'cancelamento' },
          { id: 'cancel-cond-3', field: 'message.text', operator: 'CONTAINS', value: 'quero cancelar' },
          { id: 'cancel-cond-4', field: 'message.text', operator: 'CONTAINS', value: 'encerrar contrato' },
        ],
      },
    ],
    actions: [
      { id: 'cancel-act-1', type: 'ADD_TAG', tag: 'cancellation' },
      { id: 'cancel-act-2', type: 'SET_PRIORITY', priority: 'high' },
      { id: 'cancel-act-3', type: 'TRANSFER_QUEUE', queueId: 'RETENCAO' },
    ],
    metrics: { executionsToday: 0, failuresToday: 0, successRatePercent: null, lastExecutionAt: new Date(now - 2 * 24 * 60 * 60_000).toISOString() },
    createdAt: new Date(now - 8 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(now - 8 * 24 * 60 * 60_000).toISOString(),
  },
]

let automationExecutions: AutomationExecution[] = [
  {
    id: 'auto-exec-1',
    automationId: 'automation-sem-internet',
    automationName: 'Classificar cliente sem conexão',
    ticketId: '18923',
    conversationId: 'conv-18452',
    eventId: 'evt-1001',
    status: 'SUCCESS',
    startedAt: new Date(now - 2 * 60_000).toISOString(),
    finishedAt: new Date(now - 2 * 60_000 + 1200).toISOString(),
    steps: [
      { id: 'step-1', type: 'TRIGGER', label: 'Nova mensagem recebida', status: 'SUCCESS' },
      { id: 'step-2', type: 'CONDITION', label: 'message.text contém "sem internet"', status: 'SUCCESS' },
      { id: 'step-3', type: 'ACTION', label: 'Adicionar categoria Sem conexão', status: 'SUCCESS' },
      { id: 'step-4', type: 'ACTION', label: 'Definir prioridade Alta', status: 'SUCCESS' },
      { id: 'step-5', type: 'ACTION', label: 'Consultar customerDiagnostic.regionalIncident', status: 'SUCCESS' },
    ],
  },
  {
    id: 'auto-exec-2',
    automationId: 'automation-sem-internet',
    automationName: 'Classificar cliente sem conexão',
    ticketId: '18921',
    conversationId: 'conv-18450',
    eventId: 'evt-1000',
    status: 'SUCCESS',
    startedAt: new Date(now - 4 * 60_000).toISOString(),
    finishedAt: new Date(now - 4 * 60_000 + 900).toISOString(),
    steps: [
      { id: 'step-1', type: 'TRIGGER', label: 'Nova mensagem recebida', status: 'SUCCESS' },
      { id: 'step-2', type: 'CONDITION', label: 'message.text contém "caiu"', status: 'SUCCESS' },
      { id: 'step-3', type: 'ACTION', label: 'Adicionar categoria Sem conexão', status: 'SUCCESS' },
      { id: 'step-4', type: 'ACTION', label: 'Definir prioridade Alta', status: 'SUCCESS' },
    ],
  },
  {
    id: 'auto-exec-3',
    automationId: 'automation-sem-internet',
    automationName: 'Classificar cliente sem conexão',
    ticketId: '18918',
    conversationId: 'conv-18449',
    eventId: 'evt-0999',
    status: 'FAILED',
    startedAt: new Date(now - 7 * 60_000).toISOString(),
    finishedAt: new Date(now - 7 * 60_000 + 2000).toISOString(),
    steps: [
      { id: 'step-1', type: 'TRIGGER', label: 'Nova mensagem recebida', status: 'SUCCESS' },
      { id: 'step-2', type: 'CONDITION', label: 'message.text contém "offline"', status: 'SUCCESS' },
      { id: 'step-3', type: 'ACTION', label: 'Adicionar categoria Sem conexão', status: 'SUCCESS' },
      { id: 'step-4', type: 'ACTION', label: 'Definir prioridade Alta', status: 'SUCCESS' },
      {
        id: 'step-5',
        type: 'ACTION',
        label: 'Consultar customerDiagnostic.regionalIncident',
        status: 'FAILED',
        error: 'OLT_SERVICE_TIMEOUT',
      },
    ],
  },
  {
    id: 'auto-exec-4',
    automationId: 'automation-sla',
    automationName: 'SLA próximo do limite',
    ticketId: '18910',
    conversationId: 'conv-18410',
    eventId: 'evt-0990',
    status: 'SUCCESS',
    startedAt: new Date(now - 40 * 60_000).toISOString(),
    finishedAt: new Date(now - 40 * 60_000 + 300).toISOString(),
    steps: [
      { id: 'step-1', type: 'TRIGGER', label: 'SLA próximo do limite (80%)', status: 'SUCCESS' },
      { id: 'step-2', type: 'ACTION', label: 'Definir prioridade Alta', status: 'SUCCESS' },
      { id: 'step-3', type: 'ACTION', label: 'Criar nota interna', status: 'SUCCESS' },
    ],
  },
]

let automationIdCounter = automations.length + 1

function cloneAutomation(automation: Automation): Automation {
  return JSON.parse(JSON.stringify(automation)) as Automation
}

let auditLogs: AuditLogEntry[] = [
  {
    id: 'audit-1',
    agentId: 'agent-lucas',
    agentName: 'Lucas Almeida',
    action: 'assign',
    targetType: 'conversation',
    targetId: 'conv-18452',
    createdAt: new Date(now - 40 * 60_000).toISOString(),
  },
  {
    id: 'audit-2',
    agentId: 'agent-lucas',
    agentName: 'Lucas Almeida',
    action: 'update_tags',
    targetType: 'conversation',
    targetId: 'conv-18452',
    metadata: { tags: ['no_connection'] },
    createdAt: new Date(now - 35 * 60_000).toISOString(),
  },
  {
    id: 'audit-3',
    agentId: 'agent-marina',
    agentName: 'Marina Costa',
    action: 'transfer',
    targetType: 'conversation',
    targetId: 'conv-18450',
    createdAt: new Date(now - 20 * 60_000).toISOString(),
  },
]

let sales: Sale[] = []
let campaigns: Campaign[] = []
let auditLogIdCounter = auditLogs.length + 1
let saleIdCounter = 1
let campaignIdCounter = 1

function addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): void {
  auditLogs = [
    { ...entry, id: `audit-${auditLogIdCounter}`, createdAt: new Date().toISOString() },
    ...auditLogs,
  ]
  auditLogIdCounter += 1
}

function delay<T>(value: T, ms = 240): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms)
  })
}

/**
 * Simulação das operações pré-autorizadas usadas por Macros (API_REQUEST) e
 * Automações (API_OPERATION) — ver macrosApi.runOperation. Sem `requireUser()`
 * aqui de propósito: é chamada tanto pelo método público `runMacroOperation`
 * quanto pelo preview local de Automações, que não deve depender de um import
 * circular com `services/api/macrosApi.ts`.
 */
async function resolveMockOperation(operation: string, _params: Record<string, unknown>): Promise<unknown> {
  if (operation === 'customerDiagnostic.connectionStatus') {
    return delay({ onu: 'OFFLINE', pppoe: 'OFFLINE', opticalSignal: null }, 400)
  }

  if (operation === 'customerDiagnostic.regionalIncident') {
    const affected = Math.random() < 0.5
    return delay(affected ? { affected: true, region: 'Zona Norte' } : { affected: false, region: null }, 400)
  }

  if (operation === 'billing.getOpenInvoices') {
    const hasOpen = Math.random() < 0.5
    return delay(
      hasOpen
        ? { hasOpen: true, invoices: [{ id: 'fat-2291', dueDate: new Date().toISOString(), amount: 99.9 }] }
        : { hasOpen: false, invoices: [] },
      400,
    )
  }

  throw new ApiError(`Operação "${operation}" não está disponível (INTEGRAÇÃO PENDENTE).`, 501)
}

function requireUser(): AgentUser {
  if (!currentUser) throw new UnauthorizedError()
  return currentUser
}

function requireAdmin(): AgentUser {
  const user = requireUser()
  if (user.role !== 'admin') throw new ApiError('Sem permissão administrativa.', 403)

  return user
}

function requireSupervisorOrAdmin(): AgentUser {
  const user = requireUser()
  if (user.role !== 'supervisor' && user.role !== 'admin') {
    throw new ApiError('Sem permissão para esta ação.', 403)
  }

  return user
}

function cloneAgent(agent: AgentOption): AgentOption {
  return { ...agent }
}

function cloneConversation(conversation: ConversationSummary): ConversationSummary {
  return {
    ...conversation,
    customer: conversation.customer ? { ...conversation.customer } : undefined,
    tags: conversation.tags ? [...conversation.tags] : undefined,
  }
}

function cloneMessage(message: Message): Message {
  return { ...message }
}

function cloneNote(note: ConversationNote): ConversationNote {
  return { ...note }
}

function cloneQuickReply(reply: QuickReply): QuickReply {
  return { ...reply }
}

function findMockCustomer(cpf: string): CustomerSearchResult {
  const normalizedCpf = normalizeCpf(cpf)
  const customer = mockCustomers.find((item) => item.cpf === normalizedCpf)

  if (!customer) {
    throw new ApiError('Cliente não encontrado.', 404)
  }

  const active = conversations.find(
    (conversation) =>
      conversation.status !== 'closed' &&
      normalizeCpf(conversation.customer?.document ?? '') === normalizedCpf,
  )

  return {
    customer: {
      ...customer.customer,
      maskedCpf: `***.***.***-${normalizedCpf.slice(-2)}`,
    },
    contracts: customer.contracts.map((contract) => ({ ...contract })),
    activeConversation: active?.customer
      ? {
          ...cloneConversation(active),
          customer: { ...active.customer },
        }
      : null,
  }
}

function notifyUserStatusChanged(payload: UserStatusChangedPayload): void {
  userStatusListeners.forEach((listener) => listener(payload))
}

function logUserStatusChange(
  userId: string,
  oldStatus: AttendanceStatus,
  newStatus: AttendanceStatus,
  changedBy: string,
): void {
  userStatusLogs.unshift({
    id: `status-log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId,
    oldStatus,
    newStatus,
    changedBy,
    createdAt: new Date().toISOString(),
  })
}

function updateAgentRecord(userId: string, changes: Partial<AgentOption>): AgentOption {
  const agent = agents.find((item) => item.id === userId)
  if (!agent) throw new ApiError('Usuário não encontrado.', 404)

  Object.assign(agent, changes)

  if (currentUser?.id === userId) {
    currentUser = {
      ...currentUser,
      name: agent.name,
      email: currentUser.email || agent.email,
      role: agent.role,
      attendanceStatus: agent.attendanceStatus,
      attendanceStatusChangedAt: agent.attendanceStatusChangedAt,
      presence: agent.presence,
    }
  }

  return cloneAgent(agent)
}

function updateAttendanceStatus(
  userId: string,
  status: AttendanceStatus,
  changedBy: string,
): AgentOption {
  const agent = agents.find((item) => item.id === userId)
  if (!agent) throw new ApiError('Usuário não encontrado.', 404)

  const oldStatus = agent.attendanceStatus
  const changedAt = new Date().toISOString()
  const updated = updateAgentRecord(userId, {
    attendanceStatus: status,
    attendanceStatusChangedAt: changedAt,
  })

  if (oldStatus !== status) {
    logUserStatusChange(userId, oldStatus, status, changedBy)
    notifyUserStatusChanged({
      userId,
      status,
      changedBy,
      changedAt,
    })
  }

  return updated
}

function appendSystemMessage(conversationId: string, body: string, createdAt = new Date().toISOString()): Message {
  const message: Message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    conversationId,
    authorType: 'system',
    authorName: 'Sistema',
    body,
    createdAt,
    status: 'sent',
  }

  messages.set(conversationId, [...(messages.get(conversationId) ?? []), message])
  return message
}

function getCounts(userId: string): ConversationCounts {
  return conversations.reduce<ConversationCounts>(
    (counts, conversation) => {
      if (conversation.archivedAt) {
        counts.archived += 1
        return counts
      }

      if (conversation.status === 'new') counts.new += 1
      if (conversation.assignedAgentId === userId && conversation.status !== 'closed') {
        counts.mine += 1
      }
      if (conversation.status === 'open' || conversation.status === 'waiting_agent') {
        counts.open += 1
      }
      if (conversation.status === 'waiting_customer') counts.waiting_customer += 1
      if (conversation.status === 'closed') counts.closed += 1
      return counts
    },
    { new: 0, mine: 0, open: 0, waiting_customer: 0, closed: 0, archived: 0, today: 42 },
  )
}

function matchesFilter(conversation: ConversationSummary, filter: ConversationFilter, userId: string): boolean {
  if (filter === 'archived') return Boolean(conversation.archivedAt)
  if (conversation.archivedAt) return false

  if (filter === 'new') {
    return (
      conversation.assignedAgentId === null &&
      (conversation.status === 'new' || conversation.status === 'waiting_agent')
    )
  }
  if (filter === 'mine') return conversation.assignedAgentId === userId && conversation.status !== 'closed'
  if (filter === 'open') return conversation.status === 'open' || conversation.status === 'waiting_agent'
  if (filter === 'waiting_customer') return conversation.status === 'waiting_customer'
  return conversation.status === 'closed'
}

function updateConversationSummary(conversationId: string, message: Message): ConversationSummary {
  const conversation = conversations.find((item) => item.id === conversationId)
  if (!conversation) throw new ApiError('Atendimento não encontrado.', 404)

  conversation.lastMessage = message.body
  conversation.lastMessageAt = message.createdAt
  conversation.updatedAt = message.createdAt

  if (message.authorType === 'customer') {
    conversation.unreadCount += 1
    conversation.lastCustomerMessageAt = message.createdAt
    conversation.waitingSince = message.createdAt
    conversation.archivedAt = null
    if (conversation.status === 'waiting_customer') conversation.status = 'waiting_agent'
  }

  if (message.authorType === 'agent') {
    conversation.waitingSince = undefined
  }

  conversations = [
    cloneConversation(conversation),
    ...conversations.filter((item) => item.id !== conversationId),
  ]

  return cloneConversation(conversation)
}

export const mockServer = {
  async login(credentials: LoginCredentials): Promise<AuthLoginResponse> {
    if (!credentials.email.trim() || !credentials.password.trim()) {
      throw new ApiError('Informe e-mail e senha.', 422)
    }

    const role: AgentRole = credentials.email.includes('admin')
      ? 'admin'
      : credentials.email.includes('supervisor')
        ? 'supervisor'
        : 'attendant'

    const baseAgent = agents.find((agent) => agent.role === role) ?? agents[0]
    currentUser = {
      id: baseAgent.id,
      name: baseAgent.name,
      email: credentials.email,
      role,
      attendanceStatus: baseAgent.attendanceStatus,
      attendanceStatusChangedAt: baseAgent.attendanceStatusChangedAt,
      presence: 'online',
    }
    setAccessToken(`mock-token-${currentUser.id}`)

    return delay({ user: currentUser, accessToken: `mock-token-${currentUser.id}` })
  },

  async refresh(): Promise<AuthLoginResponse> {
    const user = requireUser()
    return delay({ user, accessToken: `mock-token-${user.id}` }, 160)
  },

  async logout(): Promise<void> {
    currentUser = null
    setAccessToken(null)
    return delay(undefined, 160)
  },

  async me(): Promise<AgentUser> {
    return delay({ ...requireUser() }, 160)
  },

  async listConversations(params: {
    filter: ConversationFilter
    search?: string
    tag?: ConversationTagFilter
    sort?: ConversationQueueSort
    page?: number
    perPage?: number
    dateFrom?: string
    dateTo?: string
    ticketNumber?: string
    document?: string
    phone?: string
    assignedAgentId?: string
  }): Promise<PaginatedResponse<ConversationSummary>> {
    const user = requireUser()
    const page = params.page ?? 1
    const perPage = params.perPage ?? 30
    const search = params.search?.trim().toLowerCase()
    const ticketNumber = params.ticketNumber?.trim().toLowerCase()
    const document = params.document?.replace(/\D/g, '')
    const phone = params.phone?.replace(/\D/g, '')

    const filtered = applyConversationQueueView(
      conversations
        .filter((conversation) => matchesFilter(conversation, params.filter, user.id))
        .filter((conversation) => {
          if (!params.dateFrom && !params.dateTo) return true
          if (params.dateFrom && conversation.createdAt < params.dateFrom) return false
          if (params.dateTo && conversation.createdAt > params.dateTo) return false
          return true
        })
        .filter((conversation) => !ticketNumber || conversation.ticketNumber?.toLowerCase().includes(ticketNumber))
        .filter(
          (conversation) =>
            !document || (conversation.customer?.document ?? '').replace(/\D/g, '').includes(document),
        )
        .filter(
          (conversation) =>
            !phone || (conversation.ticketMetadata?.customer?.phone ?? '').replace(/\D/g, '').includes(phone),
        )
        .filter(
          (conversation) => !params.assignedAgentId || conversation.assignedAgentId === params.assignedAgentId,
        )
        .filter((conversation) => {
          if (!search) return true

          return [
            conversation.customerName,
            conversation.subject,
            conversation.ticketNumber,
            conversation.customer?.contractNumber,
            conversation.customer?.document,
            conversation.ticketMetadata?.customer?.phone,
            ...(conversation.tags ?? []).map(getConversationTagLabel),
          ]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(search))
        }),
      {
        tagFilter: params.tag ?? 'all',
        sort: params.sort ?? 'priority',
      },
    )

    const start = (page - 1) * perPage
    const pageData = filtered.slice(start, start + perPage)

    return delay({
      data: pageData.map(cloneConversation),
      pagination: {
        page,
        perPage,
        hasMore: start + perPage < filtered.length,
        total: filtered.length,
      },
      counts: getCounts(user.id),
    })
  },

  async searchCustomerByCpf(cpf: string): Promise<CustomerSearchResult> {
    requireUser()
    return delay(findMockCustomer(cpf))
  },

  async startCustomerChat(input: {
    cpf: string
    contractId?: string
    ticketId?: string
  }): Promise<StartCustomerChatResponse> {
    const user = requireUser()
    const result = findMockCustomer(input.cpf)

    if (result.activeConversation) {
      return delay({ conversation: result.activeConversation, created: false })
    }

    const contract = input.contractId
      ? result.contracts.find((item) => item.id === input.contractId)
      : result.contracts[0]

    if (!contract) {
      throw new ApiError('Contrato do cliente não encontrado.', 404)
    }

    const createdAt = new Date().toISOString()
    const id = `conv-manual-${Date.now()}`
    const ticketNumber = input.ticketId ?? 'Manual'
    const conversation: ConversationDetail = {
      id,
      status: 'open',
      customerName: result.customer.name,
      subject: 'Atendimento iniciado pelo atendente',
      ticketNumber,
      assignedAgentId: user.id,
      assignedAgentName: user.name,
      unreadCount: 0,
      createdAt,
      updatedAt: createdAt,
      ticketMetadata: {
        customer: {
          name: result.customer.name,
          document: result.customer.maskedCpf,
          phone: result.customer.phone ?? undefined,
        },
        contract: {
          id: contract.id,
          planName: contract.planName ?? undefined,
          status: contract.status ?? undefined,
          addressLine: contract.addressLine ?? undefined,
          city: contract.city ?? undefined,
          state: contract.state ?? undefined,
        },
        ticket: {
          id: ticketNumber,
          title: 'Atendimento iniciado pelo atendente',
          status: 'Aberto',
        },
      },
      customer: {
        name: result.customer.name,
        contractNumber: contract.id,
        document: normalizeCpf(input.cpf),
        plan: contract.planName ?? undefined,
        ticketNumber,
        reason: 'Atendimento iniciado pelo atendente',
        sgpStatus: 'Aberto',
        openedAt: createdAt,
      },
    }

    conversations = [conversation, ...conversations]
    messages.set(id, [])

    return delay({
      conversation: {
        ...cloneConversation(conversation),
        customer: { ...conversation.customer },
      },
      created: true,
    })
  },

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    const since = now - 30 * 24 * 60 * 60_000
    const document = conversation.customer.document
    const recent = document
      ? conversations.filter(
          (item) =>
            item.id !== conversation.id &&
            item.customer?.document === document &&
            new Date(item.createdAt).getTime() >= since,
        )
      : []

    return delay({
      ...cloneConversation(conversation),
      customer: { ...conversation.customer },
      customerHistory: {
        recentCount: recent.length,
        recentConversations: recent.map((item) => ({
          id: item.id,
          ticketId: item.ticketNumber,
          status: item.status,
          createdAt: item.createdAt,
          closedAt: item.closedAt ?? null,
          closeReason: item.closeReason ?? null,
        })),
      },
    })
  },

  async getMessages(
    conversationId: string,
    params: { cursor?: string | null; perPage?: number } = {},
  ): Promise<PaginatedResponse<Message>> {
    requireUser()
    const allMessages = messages.get(conversationId) ?? []
    const perPage = params.perPage ?? 30
    const endIndex = params.cursor
      ? Math.max(
          0,
          allMessages.findIndex((message) => message.id === params.cursor),
        )
      : allMessages.length
    const startIndex = Math.max(0, endIndex - perPage)
    const data = allMessages.slice(startIndex, endIndex)

    return delay({
      data: data.map(cloneMessage),
      pagination: {
        hasMore: startIndex > 0,
        nextCursor: startIndex > 0 ? allMessages[startIndex].id : null,
        perPage,
      },
    })
  },

  async assignConversation(conversationId: string): Promise<ConversationDetail> {
    const user = requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    if (conversation.assignedAgentId && conversation.assignedAgentId !== user.id) {
      throw new ApiError(
        `Este atendimento já foi assumido por ${conversation.assignedAgentName ?? 'outro atendente'}.`,
        409,
      )
    }

    conversation.status = 'open'
    conversation.assignedAgentId = user.id
    conversation.assignedAgentName = user.name
    conversation.updatedAt = new Date().toISOString()

    const systemMessage: Message = {
      id: `msg-${Date.now()}`,
      conversationId,
      authorType: 'system',
      authorName: 'Sistema',
      body: `${user.name} assumiu este atendimento.`,
      createdAt: conversation.updatedAt,
      status: 'sent',
    }

    messages.set(conversationId, [...(messages.get(conversationId) ?? []), systemMessage])

    return delay({
      ...cloneConversation(conversation),
      customer: { ...conversation.customer },
    })
  },

  async updateStatus(
    conversationId: string,
    status: ConversationStatus,
    options: { closeReason?: ConversationCloseReason; closeReasonNote?: string } = {},
  ): Promise<ConversationDetail> {
    const user = requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    conversation.status = status
    conversation.updatedAt = new Date().toISOString()
    if (status === 'waiting_customer') {
      conversation.waitingSince = undefined
    }

    if (status === 'closed') {
      conversation.closedAt = conversation.updatedAt
      conversation.closeReason = options.closeReason ?? 'resolved'
      conversation.closeReasonNote = options.closeReasonNote
      conversation.waitingSince = undefined

      const reasonLabel = getCloseReasonLabel(conversation.closeReason) ?? 'Motivo não informado'
      const systemMessage = appendSystemMessage(
        conversationId,
        `${user.name} encerrou este atendimento: ${reasonLabel}${
          conversation.closeReasonNote ? ` - ${conversation.closeReasonNote}` : ''
        }.`,
        conversation.updatedAt,
      )
      conversation.lastMessage = systemMessage.body
      conversation.lastMessageAt = systemMessage.createdAt
    }

    return delay({
      ...cloneConversation(conversation),
      customer: { ...conversation.customer },
    })
  },

  async transferConversation(
    conversationId: string,
    agentId: string,
  ): Promise<ConversationDetail> {
    const user = requireUser()
    if (user.role !== 'supervisor' && user.role !== 'admin') {
      throw new ApiError('Sem permissão para transferir atendimento.', 403)
    }

    const targetAgent = agents.find((agent) => agent.id === agentId)
    if (!targetAgent) throw new ApiError('Atendente não encontrado.', 404)

    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    conversation.assignedAgentId = targetAgent.id
    conversation.assignedAgentName = targetAgent.name
    conversation.status = 'open'
    conversation.updatedAt = new Date().toISOString()

    return delay({
      ...cloneConversation(conversation),
      customer: { ...conversation.customer },
    })
  },

  async markRead(conversationId: string): Promise<void> {
    requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (conversation) conversation.unreadCount = 0
    return delay(undefined, 120)
  },

  async deleteConversation(conversationId: string): Promise<void> {
    requireUser()
    const exists = conversations.some((item) => item.id === conversationId)
    if (!exists) throw new ApiError('Atendimento não encontrado.', 404)

    conversations = conversations.filter((item) => item.id !== conversationId)
    messages.delete(conversationId)
    return delay(undefined, 180)
  },

  async archiveConversation(conversationId: string): Promise<ConversationDetail> {
    const user = requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    conversation.archivedAt = new Date().toISOString()
    conversation.updatedAt = conversation.archivedAt
    conversation.waitingSince = undefined
    const systemMessage = appendSystemMessage(
      conversationId,
      `${user.name} arquivou esta conversa.`,
      conversation.archivedAt,
    )
    conversation.lastMessage = systemMessage.body
    conversation.lastMessageAt = systemMessage.createdAt

    return delay({
      ...cloneConversation(conversation),
      customer: { ...conversation.customer },
    })
  },

  async restoreConversation(conversationId: string): Promise<ConversationDetail> {
    const user = requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    conversation.archivedAt = null
    conversation.updatedAt = new Date().toISOString()
    const systemMessage = appendSystemMessage(
      conversationId,
      `${user.name} restaurou esta conversa.`,
      conversation.updatedAt,
    )
    conversation.lastMessage = systemMessage.body
    conversation.lastMessageAt = systemMessage.createdAt

    return delay({
      ...cloneConversation(conversation),
      customer: { ...conversation.customer },
    })
  },

  async updateConversationTags(
    conversationId: string,
    tags: ConversationTag[],
  ): Promise<ConversationDetail> {
    requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    conversation.tags = [...new Set(tags)]
    conversation.updatedAt = new Date().toISOString()

    return delay({
      ...cloneConversation(conversation),
      customer: { ...conversation.customer },
    })
  },

  async setConversationPriority(
    conversationId: string,
    priority: ConversationPriority | null,
  ): Promise<ConversationDetail> {
    requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    conversation.priorityOverride = priority
    conversation.updatedAt = new Date().toISOString()

    return delay({
      ...cloneConversation(conversation),
      customer: { ...conversation.customer },
    })
  },

  async listConversationNotes(conversationId: string): Promise<ConversationNote[]> {
    requireUser()
    return delay((conversationNotes.get(conversationId) ?? []).map(cloneNote), 150)
  },

  async addConversationNote(conversationId: string, note: string): Promise<ConversationNote> {
    const user = requireUser()
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)

    const record: ConversationNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      conversationId,
      agentId: user.id,
      agentName: user.name,
      note,
      createdAt: new Date().toISOString(),
    }

    conversationNotes.set(conversationId, [...(conversationNotes.get(conversationId) ?? []), record])
    return delay(cloneNote(record), 150)
  },

  async listQuickReplies(includeInactive = false): Promise<QuickReply[]> {
    requireUser()
    return delay(
      quickReplies.filter((reply) => includeInactive || reply.active).map(cloneQuickReply),
      120,
    )
  },

  async createQuickReply(input: QuickReplyInput): Promise<QuickReply> {
    requireAdmin()
    const shortcut = input.shortcut.trim().toLowerCase().startsWith('/')
      ? input.shortcut.trim().toLowerCase()
      : `/${input.shortcut.trim().toLowerCase()}`

    if (quickReplies.some((reply) => reply.shortcut === shortcut)) {
      throw new ApiError('Já existe uma resposta rápida com esse atalho.', 409)
    }

    const reply: QuickReply = {
      id: `qr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      shortcut,
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category?.trim() || null,
      active: true,
      createdBy: currentUser?.id ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    quickReplies = [...quickReplies, reply]
    return delay(cloneQuickReply(reply), 150)
  },

  async updateQuickReply(
    id: string,
    patch: Partial<QuickReplyInput> & { active?: boolean },
  ): Promise<QuickReply> {
    requireAdmin()
    const reply = quickReplies.find((item) => item.id === id)
    if (!reply) throw new ApiError('Resposta rápida não encontrada.', 404)

    if (patch.shortcut) {
      const shortcut = patch.shortcut.trim().toLowerCase().startsWith('/')
        ? patch.shortcut.trim().toLowerCase()
        : `/${patch.shortcut.trim().toLowerCase()}`

      if (quickReplies.some((item) => item.shortcut === shortcut && item.id !== id)) {
        throw new ApiError('Já existe uma resposta rápida com esse atalho.', 409)
      }

      reply.shortcut = shortcut
    }

    if (patch.title !== undefined) reply.title = patch.title.trim()
    if (patch.body !== undefined) reply.body = patch.body.trim()
    if (patch.category !== undefined) reply.category = patch.category?.trim() || null
    if (patch.active !== undefined) reply.active = patch.active
    reply.updatedAt = new Date().toISOString()

    return delay(cloneQuickReply(reply), 150)
  },

  async deleteQuickReply(id: string): Promise<void> {
    requireAdmin()
    const exists = quickReplies.some((item) => item.id === id)
    if (!exists) throw new ApiError('Resposta rápida não encontrada.', 404)

    quickReplies = quickReplies.filter((item) => item.id !== id)
    return delay(undefined, 120)
  },

  async listMacros(): Promise<Macro[]> {
    requireUser()
    return delay(macros.map(cloneMacro), 120)
  },

  async getMacro(id: string): Promise<Macro> {
    requireUser()
    const macro = macros.find((item) => item.id === id)
    if (!macro) throw new ApiError('Macro não encontrada.', 404)
    return delay(cloneMacro(macro), 100)
  },

  async createMacro(input: MacroInput): Promise<Macro> {
    requireSupervisorOrAdmin()
    const shortcut = input.shortcut.trim().toLowerCase().startsWith('/')
      ? input.shortcut.trim().toLowerCase()
      : `/${input.shortcut.trim().toLowerCase()}`

    if (macros.some((macro) => macro.shortcut === shortcut)) {
      throw new ApiError('Já existe uma macro com esse atalho.', 409)
    }

    const macro: Macro = {
      id: `macro-${macroIdCounter}`,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      shortcut,
      category: input.category?.trim() || undefined,
      enabled: input.enabled ?? true,
      actions: input.actions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    macroIdCounter += 1

    macros = [...macros, macro]
    return delay(cloneMacro(macro), 150)
  },

  async updateMacro(id: string, patch: Partial<MacroInput>): Promise<Macro> {
    requireSupervisorOrAdmin()
    const macro = macros.find((item) => item.id === id)
    if (!macro) throw new ApiError('Macro não encontrada.', 404)

    if (patch.shortcut) {
      const shortcut = patch.shortcut.trim().toLowerCase().startsWith('/')
        ? patch.shortcut.trim().toLowerCase()
        : `/${patch.shortcut.trim().toLowerCase()}`

      if (macros.some((item) => item.shortcut === shortcut && item.id !== id)) {
        throw new ApiError('Já existe uma macro com esse atalho.', 409)
      }

      macro.shortcut = shortcut
    }

    if (patch.name !== undefined) macro.name = patch.name.trim()
    if (patch.description !== undefined) macro.description = patch.description?.trim() || undefined
    if (patch.category !== undefined) macro.category = patch.category?.trim() || undefined
    if (patch.enabled !== undefined) macro.enabled = patch.enabled
    if (patch.actions !== undefined) macro.actions = patch.actions
    macro.updatedAt = new Date().toISOString()

    return delay(cloneMacro(macro), 150)
  },

  async deleteMacro(id: string): Promise<void> {
    requireSupervisorOrAdmin()
    const exists = macros.some((item) => item.id === id)
    if (!exists) throw new ApiError('Macro não encontrada.', 404)

    macros = macros.filter((item) => item.id !== id)
    return delay(undefined, 120)
  },

  async executeMacro(
    macroId: string,
    input: { conversationId: string; ticketId?: string; executionId: string },
  ): Promise<MacroExecutionHandle> {
    const user = requireUser()
    const macro = macros.find((item) => item.id === macroId)
    if (!macro) throw new ApiError('Macro não encontrada.', 404)

    addAuditLog({
      agentId: user.id,
      agentName: user.name,
      action: 'MACRO_STARTED',
      targetType: 'conversation',
      targetId: input.conversationId,
      metadata: { macroId, macroName: macro.name, executionId: input.executionId },
    })

    return delay({ executionId: input.executionId, status: 'RUNNING' }, 80)
  },

  async listMacroQueues(): Promise<MacroQueueOption[]> {
    requireUser()
    return delay(macroQueues.map((queue) => ({ ...queue })), 100)
  },

  async runMacroOperation(operation: string, params: Record<string, unknown>): Promise<unknown> {
    requireUser()
    return resolveMockOperation(operation, params)
  },

  async listAutomations(): Promise<Automation[]> {
    requireUser()
    return delay(automations.map(cloneAutomation), 150)
  },

  async getAutomation(id: string): Promise<Automation> {
    requireUser()
    const automation = automations.find((item) => item.id === id)
    if (!automation) throw new ApiError('Automação não encontrada.', 404)
    return delay(cloneAutomation(automation), 100)
  },

  async createAutomation(input: AutomationInput): Promise<Automation> {
    const user = requireAdmin()
    const automation: Automation = {
      id: `automation-${automationIdCounter}`,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      status: input.status ?? 'DRAFT',
      priority: input.priority ?? 10,
      stopProcessing: input.stopProcessing ?? false,
      trigger: input.trigger,
      conditionGroups: input.conditionGroups,
      actions: input.actions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user.id,
    }
    automationIdCounter += 1

    automations = [...automations, automation]
    addAuditLog({
      agentId: user.id,
      agentName: user.name,
      action: 'AUTOMATION_CREATED',
      targetType: 'automation',
      targetId: automation.id,
      metadata: { automationName: automation.name },
    })
    return delay(cloneAutomation(automation), 150)
  },

  async updateAutomation(id: string, patch: Partial<AutomationInput>): Promise<Automation> {
    const user = requireAdmin()
    const automation = automations.find((item) => item.id === id)
    if (!automation) throw new ApiError('Automação não encontrada.', 404)

    if (patch.name !== undefined) automation.name = patch.name.trim()
    if (patch.description !== undefined) automation.description = patch.description?.trim() || undefined
    if (patch.status !== undefined) automation.status = patch.status
    if (patch.priority !== undefined) automation.priority = patch.priority
    if (patch.stopProcessing !== undefined) automation.stopProcessing = patch.stopProcessing
    if (patch.trigger !== undefined) automation.trigger = patch.trigger
    if (patch.conditionGroups !== undefined) automation.conditionGroups = patch.conditionGroups
    if (patch.actions !== undefined) automation.actions = patch.actions
    automation.updatedAt = new Date().toISOString()

    addAuditLog({
      agentId: user.id,
      agentName: user.name,
      action: 'AUTOMATION_UPDATED',
      targetType: 'automation',
      targetId: id,
      metadata: { automationName: automation.name },
    })
    return delay(cloneAutomation(automation), 150)
  },

  async deleteAutomation(id: string): Promise<void> {
    const user = requireAdmin()
    const automation = automations.find((item) => item.id === id)
    if (!automation) throw new ApiError('Automação não encontrada.', 404)

    // Soft delete "de verdade" (preservando o registro) é responsabilidade do
    // modelo de dados do backend — ver README. No mock, o histórico de
    // execuções (automationExecutions) não é afetado pela remoção abaixo.
    automations = automations.filter((item) => item.id !== id)
    addAuditLog({
      agentId: user.id,
      agentName: user.name,
      action: 'AUTOMATION_DELETED',
      targetType: 'automation',
      targetId: id,
      metadata: { automationName: automation.name },
    })
    return delay(undefined, 150)
  },

  async enableAutomation(id: string): Promise<Automation> {
    const user = requireAdmin()
    const automation = automations.find((item) => item.id === id)
    if (!automation) throw new ApiError('Automação não encontrada.', 404)

    automation.status = 'ACTIVE'
    automation.updatedAt = new Date().toISOString()
    addAuditLog({
      agentId: user.id,
      agentName: user.name,
      action: 'AUTOMATION_ENABLED',
      targetType: 'automation',
      targetId: id,
    })
    return delay(cloneAutomation(automation), 120)
  },

  async disableAutomation(id: string): Promise<Automation> {
    const user = requireAdmin()
    const automation = automations.find((item) => item.id === id)
    if (!automation) throw new ApiError('Automação não encontrada.', 404)

    automation.status = 'PAUSED'
    automation.updatedAt = new Date().toISOString()
    addAuditLog({
      agentId: user.id,
      agentName: user.name,
      action: 'AUTOMATION_DISABLED',
      targetType: 'automation',
      targetId: id,
    })
    return delay(cloneAutomation(automation), 120)
  },

  async testAutomation(id: string, input: AutomationPreviewInput): Promise<AutomationTestResult> {
    requireUser()
    const automation = automations.find((item) => item.id === id)
    if (!automation) throw new ApiError('Automação não encontrada.', 404)

    const preview = await buildAutomationPreview(automation, input, (operation, params) =>
      resolveMockOperation(operation, params),
    )

    return delay(
      {
        dryRun: true,
        triggerMatched: preview.triggerMatched,
        conditionsMatched: preview.conditionsMatched,
        steps: preview.steps.map((step) => ({ label: step.label, status: step.status, detail: step.detail })),
      },
      250,
    )
  },

  async listAutomationExecutions(automationId?: string): Promise<PaginatedResponse<AutomationExecution>> {
    requireUser()
    const items = automationId
      ? automationExecutions.filter((item) => item.automationId === automationId)
      : automationExecutions

    return delay(
      { data: items.map((item) => JSON.parse(JSON.stringify(item)) as AutomationExecution), pagination: { hasMore: false } },
      150,
    )
  },

  async getAutomationExecution(executionId: string): Promise<AutomationExecution> {
    requireUser()
    const execution = automationExecutions.find((item) => item.id === executionId)
    if (!execution) throw new ApiError('Execução não encontrada.', 404)
    return delay(JSON.parse(JSON.stringify(execution)) as AutomationExecution, 100)
  },

  async listAgents(): Promise<AgentOption[]> {
    requireUser()
    return delay(agents.map(cloneAgent), 180)
  },

  async listMembers(): Promise<AgentOption[]> {
    requireAdmin()
    return delay(agents.map(cloneAgent), 180)
  },

  async updateOwnAttendanceStatus(status: AttendanceStatus): Promise<AgentOption> {
    const user = requireUser()
    return delay(updateAttendanceStatus(user.id, status, user.id), 180)
  },

  async updateMemberAttendanceStatus(userId: string, status: AttendanceStatus): Promise<AgentOption> {
    const user = requireAdmin()
    return delay(updateAttendanceStatus(userId, status, user.id), 180)
  },

  async updateMemberRole(userId: string, role: AgentRole): Promise<AgentOption> {
    const user = requireAdmin()
    if (user.id === userId) throw new ApiError('Administradores não podem alterar o próprio cargo.', 403)
    if (role !== 'attendant' && role !== 'admin') {
      throw new ApiError('Cargo inválido para gerenciamento administrativo.', 422)
    }

    return delay(updateAgentRecord(userId, { role }), 180)
  },

  async listUserStatusLogs(): Promise<UserStatusLog[]> {
    requireAdmin()
    return delay(userStatusLogs.map((log) => ({ ...log })), 160)
  },

  onUserStatusChanged(listener: UserStatusListener): () => void {
    userStatusListeners.add(listener)

    return () => {
      userStatusListeners.delete(listener)
    }
  },

  async sendAgentMessage(
    conversationId: string,
    body: string,
    clientMessageId: string,
  ): Promise<Message> {
    const user = requireUser()
    const createdAt = new Date().toISOString()
    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      conversationId,
      clientMessageId,
      authorType: 'agent',
      senderId: user.id,
      authorName: user.name,
      body,
      createdAt,
      status: 'sent',
    }

    messages.set(conversationId, [...(messages.get(conversationId) ?? []), message])
    updateConversationSummary(conversationId, message)

    return delay(cloneMessage(message), 320)
  },

  createIncomingConversation(): ConversationSummary {
    const id = `conv-${Date.now()}`
    const createdAt = new Date().toISOString()
    const conversation: ConversationSummary = {
      id,
      status: 'new',
      customerName: 'Rafael Martins',
      subject: 'Oscilação no Wi-Fi',
      ticketNumber: String(Math.floor(18_500 + Math.random() * 400)),
      unreadCount: 1,
      lastMessage: 'Meu Wi-Fi está oscilando bastante hoje.',
      lastMessageAt: createdAt,
      lastCustomerMessageAt: createdAt,
      waitingSince: createdAt,
      createdAt,
      updatedAt: createdAt,
      customer: {
        name: 'Rafael Martins',
        contractNumber: '14127',
        plan: '600 Mega',
        ticketNumber: '18577',
        reason: 'Oscilação no Wi-Fi',
        sgpStatus: 'Aberto',
        openedAt: createdAt,
      },
    }

    conversations = [conversation, ...conversations]
    messages.set(id, [
      {
        id: `msg-${Date.now()}`,
        conversationId: id,
        authorType: 'customer',
        authorName: 'Rafael Martins',
        body: conversation.lastMessage ?? '',
        createdAt,
        status: 'sent',
      },
    ])

    return cloneConversation(conversation)
  },

  async reopenConversation(conversationId: string): Promise<ConversationDetail> {
    const user = requireUser()
    if (user.role !== 'supervisor' && user.role !== 'admin') {
      throw new ApiError('Sem permissão para reabrir atendimento.', 403)
    }

    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation?.customer) throw new ApiError('Atendimento não encontrado.', 404)
    if (conversation.status !== 'closed') throw new ApiError('Apenas atendimentos encerrados podem ser reabertos.', 409)

    conversation.status = conversation.assignedAgentId ? 'open' : 'waiting_agent'
    conversation.closedAt = undefined
    conversation.closeReason = null
    conversation.closeReasonNote = undefined
    conversation.updatedAt = new Date().toISOString()
    appendSystemMessage(conversationId, `${user.name} reabriu este atendimento.`, conversation.updatedAt)
    addAuditLog({ agentId: user.id, agentName: user.name, action: 'reopen', targetType: 'conversation', targetId: conversationId })

    return delay({ ...cloneConversation(conversation), customer: { ...conversation.customer } })
  },

  async listAuditLogs(filter: {
    agentId?: string
    action?: string
    targetType?: string
    targetId?: string
    dateFrom?: string
    dateTo?: string
    perPage?: number
  }): Promise<PaginatedResponse<AuditLogEntry>> {
    requireUser()
    let items = [...auditLogs]
    if (filter.agentId) items = items.filter((log) => log.agentId === filter.agentId)
    if (filter.action) items = items.filter((log) => log.action === filter.action)
    if (filter.targetType) items = items.filter((log) => log.targetType === filter.targetType)
    if (filter.targetId) items = items.filter((log) => log.targetId === filter.targetId)
    if (filter.dateFrom) items = items.filter((log) => log.createdAt >= filter.dateFrom!)
    if (filter.dateTo) items = items.filter((log) => log.createdAt <= filter.dateTo!)

    const perPage = filter.perPage ?? 50
    return delay({ data: items.slice(0, perPage), pagination: { hasMore: items.length > perPage, nextCursor: null } }, 150)
  },

  async getMonitoringOverview(): Promise<MonitoringOverview> {
    requireUser()
    const active = conversations.filter((item) => !item.archivedAt && item.status !== 'closed')
    const waitingForAgent = active.filter((item) => item.status === 'new' || item.status === 'waiting_agent')
    const closedToday = conversations.filter((item) => item.status === 'closed')
    const nowTs = Date.now()
    const waits = waitingForAgent.map((item) => Math.round((nowTs - new Date(item.updatedAt).getTime()) / 1000))

    return delay({
      activeNow: active.length,
      waitingForAgent: waitingForAgent.length,
      waitingForCustomer: active.filter((item) => item.status === 'waiting_customer').length,
      closedToday: closedToday.length,
      longestWaitSeconds: waits.length ? Math.max(...waits) : null,
      avgWaitSeconds: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      avgHandleSeconds: 18 * 60,
      agentsOnline: agents.filter((agent) => agent.attendanceStatus === 'AVAILABLE').length,
      agentsInvisible: agents.filter((agent) => agent.attendanceStatus === 'INVISIBLE').length,
      agentsOffline: 0,
      agentsTotal: agents.length,
    })
  },

  async getMonitoringQueues(): Promise<MonitoringQueue[]> {
    requireUser()
    const active = conversations.filter((item) => !item.archivedAt && item.status !== 'closed')
    const agentsOnline = agents.filter((agent) => agent.attendanceStatus === 'AVAILABLE').length
    const buckets = new Map<string, { waiting: number; inProgress: number; longestWait: number }>()
    const nowTs = Date.now()

    for (const conversation of active) {
      const tags = conversation.tags?.length ? conversation.tags : (['sem_categoria'] as const)
      const isWaiting = conversation.status === 'new' || conversation.status === 'waiting_agent'
      const wait = Math.round((nowTs - new Date(conversation.updatedAt).getTime()) / 1000)

      for (const tag of tags) {
        const bucket = buckets.get(tag) ?? { waiting: 0, inProgress: 0, longestWait: 0 }
        if (isWaiting) {
          bucket.waiting += 1
          bucket.longestWait = Math.max(bucket.longestWait, wait)
        } else {
          bucket.inProgress += 1
        }
        buckets.set(tag, bucket)
      }
    }

    return delay(
      [...buckets.entries()]
        .filter(([, value]) => value.waiting > 0 || value.inProgress > 0)
        .map(([tag, value]) => ({
          tag: tag as MonitoringQueue['tag'],
          waiting: value.waiting,
          inProgress: value.inProgress,
          agentsOnline,
          longestWaitSeconds: value.waiting > 0 ? value.longestWait : null,
        })),
    )
  },

  async getMonitoringAgents(): Promise<MonitoringAgent[]> {
    requireUser()
    const nowTs = Date.now()

    return delay(
      agents.map((agent) => {
        const activeConversations = conversations.filter(
          (item) => item.assignedAgentId === agent.id && !item.archivedAt && item.status !== 'closed',
        )
        const oldest = activeConversations
          .map((item) => new Date(item.createdAt).getTime())
          .sort((a, b) => a - b)[0]

        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          attendanceStatus: agent.attendanceStatus,
          statusSinceSeconds: agent.attendanceStatusChangedAt
            ? Math.round((nowTs - new Date(agent.attendanceStatusChangedAt).getTime()) / 1000)
            : null,
          activeConversations: activeConversations.length,
          oldestActiveSeconds: oldest ? Math.round((nowTs - oldest) / 1000) : null,
        }
      }),
    )
  },

  async createSale(input: CreateSaleInput): Promise<Sale> {
    const user = requireUser()
    const sale: Sale = {
      id: `sale-${saleIdCounter}`,
      customerId: input.customerId ?? null,
      contractId: input.contractId ?? null,
      conversationId: input.conversationId ?? null,
      agentId: user.id,
      productType: input.productType,
      planName: input.planName ?? null,
      value: input.value,
      origin: input.origin ?? null,
      status: 'pending',
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    saleIdCounter += 1
    sales = [sale, ...sales]
    addAuditLog({ agentId: user.id, agentName: user.name, action: 'sale_created', targetType: 'sale', targetId: sale.id })
    return delay({ ...sale })
  },

  async updateSale(id: string, patch: Partial<CreateSaleInput> & { status?: SaleStatus }): Promise<Sale> {
    const user = requireUser()
    const sale = sales.find((item) => item.id === id)
    if (!sale) throw new ApiError('Venda não encontrada.', 404)
    if (sale.agentId !== user.id && user.role === 'attendant') {
      throw new ApiError('Sem permissão para alterar esta venda.', 403)
    }

    Object.assign(sale, patch, { updatedAt: new Date().toISOString() })
    addAuditLog({
      agentId: user.id,
      agentName: user.name,
      action: patch.status === 'cancelled' ? 'sale_cancelled' : 'sale_updated',
      targetType: 'sale',
      targetId: id,
    })
    return delay({ ...sale })
  },

  async listSales(filter: { agentId?: string; status?: SaleStatus; productType?: string }): Promise<PaginatedResponse<Sale>> {
    const user = requireUser()
    let items = [...sales]
    if (user.role === 'attendant') items = items.filter((sale) => sale.agentId === user.id)
    else if (filter.agentId) items = items.filter((sale) => sale.agentId === filter.agentId)
    if (filter.status) items = items.filter((sale) => sale.status === filter.status)
    if (filter.productType) items = items.filter((sale) => sale.productType === filter.productType)

    return delay({ data: items, pagination: { hasMore: false, nextCursor: null } }, 150)
  },

  async getSalesSummary(dateFrom?: string, dateTo?: string): Promise<SaleSummary> {
    requireUser()
    const active = sales.filter(
      (sale) =>
        sale.status !== 'cancelled' &&
        (!dateFrom || sale.createdAt >= dateFrom) &&
        (!dateTo || sale.createdAt <= dateTo),
    )
    const valuePeriod = active.reduce((sum, sale) => sum + sale.value, 0)
    const byAgent = new Map<string, { count: number; value: number }>()
    const byProduct = new Map<string, { count: number; value: number }>()

    for (const sale of active) {
      const agentEntry = byAgent.get(sale.agentId) ?? { count: 0, value: 0 }
      agentEntry.count += 1
      agentEntry.value += sale.value
      byAgent.set(sale.agentId, agentEntry)

      const productEntry = byProduct.get(sale.productType) ?? { count: 0, value: 0 }
      productEntry.count += 1
      productEntry.value += sale.value
      byProduct.set(sale.productType, productEntry)
    }

    return delay({
      countToday: active.length,
      countPeriod: active.length,
      valuePeriod,
      averageTicket: active.length ? Number((valuePeriod / active.length).toFixed(2)) : 0,
      byAgent: [...byAgent.entries()].map(([agentId, value]) => ({ agentId, ...value })),
      byProduct: [...byProduct.entries()].map(([productType, value]) => ({ productType, ...value })),
    })
  },

  async estimateCampaignAudience(filter: CampaignAudienceFilter | null): Promise<AudienceEstimate> {
    requireUser()
    const matches = conversations.filter(
      (item) =>
        (!filter?.status || item.status === filter.status) &&
        (!filter?.tags?.length || item.tags?.some((tag) => filter.tags!.includes(tag))),
    )
    const seen = new Set<string>()
    const sample: AudienceEstimate['sample'] = []
    for (const item of matches) {
      const key = item.customer?.document ?? item.customerName
      if (!key || seen.has(key)) continue
      seen.add(key)
      sample.push({ customerId: key, customerName: item.customerName })
      if (sample.length >= 20) break
    }
    return delay({ count: seen.size, sample })
  },

  async createCampaign(input: CampaignInput): Promise<Campaign> {
    const user = requireSupervisorOrAdmin()
    const audience = await this.estimateCampaignAudience(input.audienceFilter ?? null)
    const campaign: Campaign = {
      id: `campaign-${campaignIdCounter}`,
      name: input.name,
      channel: input.channel,
      audienceFilter: input.audienceFilter ?? null,
      messageBody: input.messageBody,
      scheduledAt: input.scheduledAt ?? null,
      status: input.scheduledAt ? 'scheduled' : 'draft',
      createdBy: user.id,
      recipientsCount: audience.count,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      statusMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    campaignIdCounter += 1
    campaigns = [campaign, ...campaigns]
    addAuditLog({ agentId: user.id, agentName: user.name, action: 'campaign_created', targetType: 'campaign', targetId: campaign.id })
    return delay({ ...campaign })
  },

  async updateCampaign(id: string, patch: Partial<CampaignInput>): Promise<Campaign> {
    requireSupervisorOrAdmin()
    const campaign = campaigns.find((item) => item.id === id)
    if (!campaign) throw new ApiError('Campanha não encontrada.', 404)
    Object.assign(campaign, patch, { updatedAt: new Date().toISOString() })
    return delay({ ...campaign })
  },

  async listCampaigns(filter: { status?: Campaign['status']; channel?: Campaign['channel'] } = {}): Promise<
    PaginatedResponse<Campaign>
  > {
    requireUser()
    let items = [...campaigns]
    if (filter.status) items = items.filter((campaign) => campaign.status === filter.status)
    if (filter.channel) items = items.filter((campaign) => campaign.channel === filter.channel)
    return delay({ data: items, pagination: { hasMore: false, nextCursor: null } }, 150)
  },

  async cancelCampaign(id: string): Promise<Campaign> {
    const user = requireSupervisorOrAdmin()
    const campaign = campaigns.find((item) => item.id === id)
    if (!campaign) throw new ApiError('Campanha não encontrada.', 404)
    campaign.status = 'cancelled'
    campaign.updatedAt = new Date().toISOString()
    addAuditLog({ agentId: user.id, agentName: user.name, action: 'campaign_cancelled', targetType: 'campaign', targetId: id })
    return delay({ ...campaign })
  },

  async sendCampaign(id: string): Promise<{ ok: false; message: string }> {
    const user = requireAdmin()
    addAuditLog({ agentId: user.id, agentName: user.name, action: 'campaign_send_attempted', targetType: 'campaign', targetId: id })
    return delay({
      ok: false,
      message:
        'Nenhum canal de envio (WhatsApp/SMS/e-mail) está integrado nesta instalação. INTEGRAÇÃO PENDENTE.',
    })
  },

}
