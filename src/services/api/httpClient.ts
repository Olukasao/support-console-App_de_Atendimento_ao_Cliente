import { appConfig } from '../../config'

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export class UnauthorizedError extends ApiError {
  constructor(payload?: unknown) {
    super('Sessão expirada. Faça login novamente.', 401, payload)
    this.name = 'UnauthorizedError'
  }
}

// O access token vive só em memória: nunca é persistido em localStorage/sessionStorage,
// para não sobreviver a um XSS. O refresh token nem chega ao frontend — fica inteiramente
// no cookie HttpOnly que o backend define e lê via `credentials: 'include'`.
let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

interface ApiRequestOptions {
  method?: string
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  unwrap?: boolean
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return appConfig.apiUrl ? `${appConfig.apiUrl}${path}` : path
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const error = record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : undefined
    const message = record.message ?? error?.message ?? record.error
    if (typeof message === 'string' && message.trim()) return message
  }

  return fallback
}

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if ('data' in record) return record.data as T
  }

  return payload as T
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, headers, signal, unwrap = true }: ApiRequestOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers)

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (accessToken) {
    requestHeaders.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers: requestHeaders,
    credentials: 'include',
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const contentType = response.headers.get('Content-Type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : undefined

  if (!response.ok) {
    if (response.status === 401) throw new UnauthorizedError(payload)

    throw new ApiError(
      getErrorMessage(payload, 'Não foi possível concluir a solicitação.'),
      response.status,
      payload,
    )
  }

  if (response.status === 204) return undefined as T

  return unwrap ? unwrapData<T>(payload) : (payload as T)
}
