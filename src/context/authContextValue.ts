import { createContext } from 'react'
import type { AgentUser, LoginCredentials } from '../types/domain'

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  user: AgentUser | null
  status: AuthStatus
  login(credentials: LoginCredentials): Promise<void>
  loginWithInternalChat(credentials: LoginCredentials): Promise<void>
  loginWithInternalChatCode(input: { code: string; redirectUri: string }): Promise<void>
  logout(): Promise<void>
  refreshSession(): Promise<void>
  updateUser(user: AgentUser): void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
