import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authApi } from '../services/api/authApi'
import type { AgentUser, LoginCredentials } from '../types/domain'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContextValue'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AgentUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('checking')

  const refreshSession = useCallback(async () => {
    setStatus('checking')

    try {
      const currentUser = await authApi.me()
      setUser(currentUser)
      setStatus('authenticated')
      return
    } catch {
      try {
        await authApi.refresh()
        const currentUser = await authApi.me()
        setUser(currentUser)
        setStatus('authenticated')
        return
      } catch {
        setUser(null)
        setStatus('unauthenticated')
      }
    }
  }, [])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const login = useCallback(async (credentials: LoginCredentials) => {
    setStatus('checking')
    await authApi.login(credentials)
    const currentUser = await authApi.me()
    setUser(currentUser)
    setStatus('authenticated')
  }, [])

  const loginWithInternalChat = useCallback(async (credentials: LoginCredentials) => {
    setStatus('checking')
    await authApi.loginWithInternalChat(credentials)
    const currentUser = await authApi.me()
    setUser(currentUser)
    setStatus('authenticated')
  }, [])

  const loginWithInternalChatCode = useCallback(async (input: { code: string; redirectUri: string }) => {
    setStatus('checking')
    await authApi.loginWithInternalChatCode(input)
    const currentUser = await authApi.me()
    setUser(currentUser)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  const updateUser = useCallback((nextUser: AgentUser) => {
    setUser(nextUser)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      loginWithInternalChat,
      loginWithInternalChatCode,
      logout,
      refreshSession,
      updateUser,
    }),
    [
      login,
      loginWithInternalChat,
      loginWithInternalChatCode,
      logout,
      refreshSession,
      status,
      updateUser,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
