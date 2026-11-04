import type {
  ConversationNote,
  ConversationSummary,
  Message,
  MessageReadPayload,
  TypingPayload,
  UserStatusChangedPayload,
} from '../../types/domain'

export type SocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface SocketEventMap {
  new_message: Message
  conversation_created: ConversationSummary
  conversation_updated: ConversationSummary
  conversation_assigned: ConversationSummary
  conversation_transferred: ConversationSummary
  conversation_closed: ConversationSummary
  message_read: MessageReadPayload
  typing: TypingPayload
  'user:status_changed': UserStatusChangedPayload
  note_added: ConversationNote
}

export type SocketEventName = keyof SocketEventMap

export interface SocketConnectOptions {
  agentId: string
}

export interface SendMessagePayload {
  conversationId: string
  body: string
  clientMessageId: string
  agentId?: string
  authorName?: string
  technicianName?: string
}

export interface ChatSocketService {
  connect(options: SocketConnectOptions): void
  disconnect(): void
  getState(): SocketConnectionState
  on<K extends SocketEventName>(
    event: K,
    callback: (payload: SocketEventMap[K]) => void,
  ): () => void
  onConnectionChange(callback: (state: SocketConnectionState) => void): () => void
  emit(event: string, payload?: unknown): void
  sendMessage(payload: SendMessagePayload): Promise<Message>
}
