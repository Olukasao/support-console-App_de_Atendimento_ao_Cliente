import { mockServer } from '../../mocks/mockServer'
import { SocketServiceBase } from './socketBase'
import type { SendMessagePayload, SocketConnectOptions, SocketEventMap } from './socketTypes'

export class MockSocketService extends SocketServiceBase {
  private typingTimer: number | null = null
  private createdTimer: number | null = null
  private unsubscribeStatusChanged: (() => void) | null = null
  private joinedConversationIds = new Set<string>()

  connect(_options: SocketConnectOptions): void {
    if (this.state === 'connected' || this.state === 'connecting') return

    this.setState('connecting')
    window.setTimeout(() => {
      this.setState('connected')
      this.unsubscribeStatusChanged = mockServer.onUserStatusChanged((payload) => {
        this.notify('user:status_changed', payload)
      })
      this.startTimers()
    }, 280)
  }

  disconnect(): void {
    this.stopTimers()
    this.unsubscribeStatusChanged?.()
    this.unsubscribeStatusChanged = null
    this.joinedConversationIds.clear()
    this.setState('disconnected')
  }

  emit(event: string, payload?: unknown): void {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const conversationId =
      typeof record.conversationId === 'string'
        ? record.conversationId
        : typeof record.conversation_id === 'string'
          ? record.conversation_id
          : null

    if (event === 'join_conversation' && conversationId) {
      this.joinedConversationIds.add(conversationId)
    }

    if (event === 'leave_conversation' && conversationId) {
      this.joinedConversationIds.delete(conversationId)
    }

    if (event === 'typing_start' && conversationId) {
      this.notify('typing', {
        conversationId,
        customerName: 'Cliente',
        isTyping: true,
      })
    }

    if (event === 'typing_stop' && conversationId) {
      this.notify('typing', {
        conversationId,
        customerName: 'Cliente',
        isTyping: false,
      })
    }
  }

  async sendMessage(payload: SendMessagePayload): Promise<SocketEventMap['new_message']> {
    if (this.state !== 'connected') {
      throw new Error('Socket desconectado.')
    }

    return mockServer.sendAgentMessage(
      payload.conversationId,
      payload.body,
      payload.clientMessageId,
    )
  }

  private startTimers(): void {
    this.stopTimers()

    this.typingTimer = window.setInterval(() => {
      const conversationId = this.pickJoinedConversationId() ?? 'conv-18452'
      this.notify('typing', {
        conversationId,
        customerName: 'Cliente',
        isTyping: true,
      })

      window.setTimeout(() => {
        this.notify('typing', {
          conversationId,
          customerName: 'Cliente',
          isTyping: false,
        })
      }, 2_200)
    }, 12_000)

    this.createdTimer = window.setInterval(() => {
      const conversation = mockServer.createIncomingConversation()
      this.notify('conversation_created', conversation)
    }, 32_000)
  }

  private stopTimers(): void {
    if (this.typingTimer) window.clearInterval(this.typingTimer)
    if (this.createdTimer) window.clearInterval(this.createdTimer)
    this.typingTimer = null
    this.createdTimer = null
  }

  private pickJoinedConversationId(): string | null {
    const values = Array.from(this.joinedConversationIds)
    if (!values.length) return null

    return values[Math.floor(Math.random() * values.length)] ?? null
  }
}
