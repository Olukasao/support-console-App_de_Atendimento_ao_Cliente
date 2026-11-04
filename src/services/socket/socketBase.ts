import type {
  ChatSocketService,
  SocketConnectionState,
  SocketEventMap,
  SocketEventName,
} from './socketTypes'

type Listener<T> = (payload: T) => void
type UnknownListener = (payload: unknown) => void

export abstract class SocketServiceBase implements ChatSocketService {
  protected state: SocketConnectionState = 'idle'
  private eventListeners: Partial<Record<SocketEventName, Set<UnknownListener>>> = {}
  private stateListeners = new Set<(state: SocketConnectionState) => void>()

  abstract connect(options: { agentId: string }): void
  abstract disconnect(): void
  abstract emit(event: string, payload?: unknown): void
  abstract sendMessage(payload: {
    conversationId: string
    body: string
    clientMessageId: string
  }): Promise<SocketEventMap['new_message']>

  getState(): SocketConnectionState {
    return this.state
  }

  on<K extends SocketEventName>(
    event: K,
    callback: Listener<SocketEventMap[K]>,
  ): () => void {
    const listeners = this.getEventSet(event)
    const unknownCallback = callback as UnknownListener
    listeners.add(unknownCallback)

    return () => {
      listeners.delete(unknownCallback)
    }
  }

  onConnectionChange(callback: (state: SocketConnectionState) => void): () => void {
    this.stateListeners.add(callback)
    callback(this.state)

    return () => {
      this.stateListeners.delete(callback)
    }
  }

  protected setState(state: SocketConnectionState): void {
    this.state = state
    this.stateListeners.forEach((listener) => listener(state))
  }

  protected notify<K extends SocketEventName>(event: K, payload: SocketEventMap[K]): void {
    this.eventListeners[event]?.forEach((listener) => listener(payload))
  }

  private getEventSet(event: SocketEventName): Set<UnknownListener> {
    const listeners = this.eventListeners[event]
    if (listeners) return listeners

    const nextListeners = new Set<UnknownListener>()
    this.eventListeners[event] = nextListeners
    return nextListeners
  }
}
