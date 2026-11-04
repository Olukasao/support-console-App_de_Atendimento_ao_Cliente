import { io, type Socket } from 'socket.io-client'
import { appConfig } from '../../config'
import { normalizeConversation, normalizeConversationNote, normalizeMessage } from '../api/conversationsApi'
import { getAccessToken } from '../api/httpClient'
import { SocketServiceBase } from './socketBase'
import type { SendMessagePayload, SocketConnectOptions, SocketEventMap } from './socketTypes'
import { normalizeAttendanceStatus } from '../../utils/agents'

function extractMessage(payload: unknown): SocketEventMap['new_message'] {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if ('data' in record) return extractMessage(record.data)
    if ('message' in record) return normalizeMessage(record.message)
  }

  return normalizeMessage(payload)
}

function extractConversation(payload: unknown): SocketEventMap['conversation_updated'] {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if ('data' in record) return extractConversation(record.data)
    if ('conversation' in record) return normalizeConversation(record.conversation)
  }

  return normalizeConversation(payload)
}

function extractReadPayload(payload: unknown): SocketEventMap['message_read'] {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}

  return {
    conversationId: String(record.conversationId ?? record.conversation_id ?? ''),
    agentId: record.participantType === 'agent' ? String(record.participantId ?? record.participant_id ?? '') : undefined,
  }
}

function extractTypingPayload(payload: unknown): SocketEventMap['typing'] {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}

  return {
    conversationId: String(record.conversationId ?? record.conversation_id ?? ''),
    customerName: String(record.customerName ?? record.customer_name ?? 'Cliente'),
    isTyping: Boolean(record.isTyping ?? record.is_typing),
  }
}

function extractNotePayload(payload: unknown): SocketEventMap['note_added'] {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if ('data' in record) return extractNotePayload(record.data)
    if ('note' in record) return normalizeConversationNote(record.note)
  }

  return normalizeConversationNote(payload)
}

function extractUserStatusChangedPayload(payload: unknown): SocketEventMap['user:status_changed'] {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const data = record.data && typeof record.data === 'object'
    ? (record.data as Record<string, unknown>)
    : record

  return {
    userId: String(data.userId ?? data.user_id ?? ''),
    status: normalizeAttendanceStatus(data.status ?? data.attendanceStatus ?? data.attendance_status),
    changedBy:
      data.changedBy === undefined && data.changed_by === undefined
        ? undefined
        : String(data.changedBy ?? data.changed_by),
    changedAt:
      data.changedAt === undefined &&
      data.changed_at === undefined &&
      data.createdAt === undefined &&
      data.created_at === undefined
        ? undefined
        : String(data.changedAt ?? data.changed_at ?? data.createdAt ?? data.created_at),
  }
}

export class RealSocketService extends SocketServiceBase {
  private socket: Socket | null = null
  private active = false
  private agentId: string | null = null

  connect(options: SocketConnectOptions): void {
    if (this.socket?.connected || this.state === 'connecting') return

    this.active = true
    this.agentId = options.agentId
    this.setState('connecting')

    if (!this.socket) {
      this.socket = io(appConfig.apiUrl || undefined, {
        autoConnect: false,
        withCredentials: true,
        transports: ['websocket', 'polling'],
      })
      this.registerSocketHandlers(this.socket)
    }

    this.socket.auth = {
      userType: 'agent',
      agentId: options.agentId,
      token: getAccessToken() ?? undefined,
    }
    this.socket.connect()
  }

  disconnect(): void {
    this.active = false
    this.socket?.disconnect()
    this.setState('disconnected')
  }

  emit(event: string, payload?: unknown): void {
    this.socket?.emit(event, payload)
  }

  sendMessage(payload: SendMessagePayload): Promise<SocketEventMap['new_message']> {
    if (!this.socket?.connected) {
      return Promise.reject(new Error('Socket desconectado.'))
    }

    return new Promise((resolve, reject) => {
      this.socket?.timeout(8_000).emit(
        'send_message',
        {
          conversationId: payload.conversationId,
          conversation_id: payload.conversationId,
          message: payload.body,
          body: payload.body,
          clientMessageId: payload.clientMessageId,
          client_message_id: payload.clientMessageId,
          agentId: payload.agentId,
          agent_id: payload.agentId,
          authorName: payload.authorName,
          author_name: payload.authorName,
          technicianName: payload.technicianName,
          technician_name: payload.technicianName,
        },
        (error: Error | null, response: unknown) => {
          if (error) {
            reject(error)
            return
          }

          if (
            response &&
            typeof response === 'object' &&
            (response as Record<string, unknown>).ok === false
          ) {
            const record = response as Record<string, unknown>
            reject(new Error(String(record.error ?? 'Não foi possível enviar a mensagem.')))
            return
          }

          resolve(extractMessage(response))
        },
      )
    })
  }

  private registerSocketHandlers(socket: Socket): void {
    socket.on('connect', () => {
      this.setState('connected')
    })

    socket.on('disconnect', () => {
      this.setState(this.active ? 'reconnecting' : 'disconnected')
    })

    socket.on('connect_error', () => {
      this.setState(this.active ? 'reconnecting' : 'disconnected')
    })

    socket.io.on('reconnect_attempt', () => {
      socket.auth = {
        userType: 'agent',
        agentId: this.agentId ?? undefined,
        token: getAccessToken() ?? undefined,
      }
      this.setState('reconnecting')
    })

    socket.io.on('reconnect', () => {
      this.setState('connected')
    })

    socket.on('new_message', (payload: unknown) => {
      this.notify('new_message', extractMessage(payload))
    })
    socket.on('conversation_created', (payload: unknown) => {
      this.notify('conversation_created', extractConversation(payload))
    })
    socket.on('conversation_updated', (payload: unknown) => {
      this.notify('conversation_updated', extractConversation(payload))
    })
    socket.on('conversation_assigned', (payload: unknown) => {
      this.notify('conversation_assigned', extractConversation(payload))
    })
    socket.on('conversation_transferred', (payload: unknown) => {
      this.notify('conversation_transferred', extractConversation(payload))
    })
    socket.on('conversation_closed', (payload: unknown) => {
      this.notify('conversation_closed', extractConversation(payload))
    })
    socket.on('message_read', (payload: unknown) => {
      this.notify('message_read', extractReadPayload(payload))
    })
    socket.on('typing', (payload: unknown) => {
      this.notify('typing', extractTypingPayload(payload))
    })
    socket.on('user:status_changed', (payload: unknown) => {
      this.notify('user:status_changed', extractUserStatusChangedPayload(payload))
    })
    socket.on('user_status_changed', (payload: unknown) => {
      this.notify('user:status_changed', extractUserStatusChangedPayload(payload))
    })
    socket.on('note_added', (payload: unknown) => {
      this.notify('note_added', extractNotePayload(payload))
    })
  }
}
