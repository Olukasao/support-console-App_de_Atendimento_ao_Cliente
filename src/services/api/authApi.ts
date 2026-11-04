import { appConfig } from '../../config'
import { mockServer } from '../../mocks/mockServer'
import type { AgentUser, AuthLoginResponse, LoginCredentials } from '../../types/domain'
import { normalizeAgentRole, normalizeAttendanceStatus } from '../../utils/agents'
import { apiRequest, setAccessToken } from './httpClient'

export const internalChatSsoStateKey = 'acessanet_internal_chat_sso_state'
export const internalChatSsoReturnToKey = 'acessanet_internal_chat_sso_return_to'

function rememberAccessToken(response: AuthLoginResponse): void {
  setAccessToken(response.accessToken ?? response.access_token ?? null)
}

function normalizeAgent(payload: unknown): AgentUser {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const wrapped = record.data && typeof record.data === 'object'
    ? (record.data as Record<string, unknown>)
    : record
  const source = wrapped.agent && typeof wrapped.agent === 'object'
    ? (wrapped.agent as Record<string, unknown>)
    : wrapped.user && typeof wrapped.user === 'object'
      ? (wrapped.user as Record<string, unknown>)
      : wrapped

  return {
    id: String(source.id ?? ''),
    name: String(source.name ?? ''),
    email: String(source.email ?? ''),
    role: normalizeAgentRole(source.role ?? source.perfil),
    attendanceStatus: normalizeAttendanceStatus(
      source.attendanceStatus ??
        source.attendance_status ??
        source.availabilityStatus ??
        source.availability_status ??
        source.status,
    ),
    attendanceStatusChangedAt: asOptionalString(
      source.attendanceStatusChangedAt ??
        source.attendance_status_changed_at ??
        source.availabilityStatusChangedAt ??
        source.availability_status_changed_at ??
        source.statusChangedAt ??
        source.status_changed_at,
    ),
  }
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || typeof value === 'object') return undefined

  const text = String(value).trim()
  return text ? text : undefined
}

function toQueryString(params: Record<string, string>): string {
  const query = new URLSearchParams(params)
  return query.toString()
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<AuthLoginResponse> {
    if (appConfig.useMock) return mockServer.login(credentials)

    const response = await apiRequest<AuthLoginResponse>('/api/agent/auth/login', {
      method: 'POST',
      body: credentials,
    })
    rememberAccessToken(response)
    return response
  },

  async loginWithInternalChat(credentials: LoginCredentials): Promise<AuthLoginResponse> {
    if (appConfig.useMock) return mockServer.login(credentials)

    const response = await apiRequest<AuthLoginResponse>('/api/agent/auth/internal-chat/login', {
      method: 'POST',
      body: credentials,
    })
    rememberAccessToken(response)
    return response
  },

  async getInternalChatAuthorizeUrl(input: {
    redirectUri: string
    state: string
  }): Promise<string> {
    if (appConfig.useMock) {
      return `/login/internal-chat/callback?${toQueryString({
        code: 'mock-internal-chat-code-000000000000',
        state: input.state,
      })}`
    }

    const response = await apiRequest<{ authorizeUrl?: string }>(
      `/api/agent/auth/internal-chat/authorize-url?${toQueryString({
        redirectUri: input.redirectUri,
        state: input.state,
      })}`,
    )

    if (!response.authorizeUrl) {
      throw new Error('internal_chat_invalid_response')
    }

    return response.authorizeUrl
  },

  async loginWithInternalChatCode(input: {
    code: string
    redirectUri: string
  }): Promise<AuthLoginResponse> {
    if (appConfig.useMock) return mockServer.login({ email: 'mock@example.com', password: 'mock' })

    const response = await apiRequest<AuthLoginResponse>('/api/agent/auth/internal-chat/callback', {
      method: 'POST',
      body: input,
    })
    rememberAccessToken(response)
    return response
  },

  async refresh(): Promise<AuthLoginResponse> {
    if (appConfig.useMock) return mockServer.refresh()

    // O refresh token vai só no cookie HttpOnly (enviado via credentials: 'include');
    // o frontend não lê nem envia esse valor no corpo da requisição.
    const response = await apiRequest<AuthLoginResponse>('/api/agent/auth/refresh', {
      method: 'POST',
    })
    rememberAccessToken(response)
    return response
  },

  async logout(): Promise<void> {
    if (appConfig.useMock) {
      await mockServer.logout()
      return
    }

    try {
      await apiRequest<void>('/api/agent/auth/logout', { method: 'POST' })
    } finally {
      setAccessToken(null)
    }
  },

  async me(): Promise<AgentUser> {
    if (appConfig.useMock) return mockServer.me()

    const response = await apiRequest<unknown>('/api/agent/auth/me')
    return normalizeAgent(response)
  },
}
