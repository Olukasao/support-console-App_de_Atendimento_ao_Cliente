import { useState, type FormEvent } from 'react'
import { Lock, LogIn, Mail, MessageCircle } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { appConfig } from '../config'
import { useAuth } from '../hooks/useAuth'
import {
  authApi,
  internalChatSsoReturnToKey,
  internalChatSsoStateKey,
} from '../services/api/authApi'

interface LocationState {
  from?: {
    pathname?: string
  }
}

type LoginProvider = 'atendimento' | 'internal-chat'

function getLoginErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'Não foi possível entrar no atendimento.'
  const messages: Record<string, string> = {
    invalid_credentials: 'E-mail ou senha inválidos.',
    agent_disabled: 'Seu usuário de atendimento está desativado.',
    agent_not_registered: 'Login validado no chat interno, mas este e-mail ainda não está cadastrado como atendente.',
    internal_chat_not_configured: 'Login com chat interno ainda não foi configurado.',
    internal_chat_unavailable: 'Chat interno indisponível para validar o login agora.',
    internal_chat_invalid_response: 'Chat interno respondeu em um formato inesperado.',
    invalid_redirect_uri: 'Retorno do login com chat interno inválido.',
    redirect_uri_not_allowed: 'Este endereço do Atendimento não está liberado para login com chat interno.',
    invalid_sso_state: 'Não foi possível iniciar o login seguro com o chat interno.',
  }

  return messages[message] ?? message
}

function createSsoState(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replaceAll('-', '')
  }

  return `${Date.now()}${Math.random()}`.replace(/\D/g, '').padEnd(16, '0')
}

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submittingProvider, setSubmittingProvider] = useState<LoginProvider | null>(null)
  const submitting = submittingProvider !== null

  if (status === 'authenticated') {
    return <Navigate to="/atendimento" replace />
  }

  async function runLogin(provider: LoginProvider) {
    setError('')
    setSubmittingProvider(provider)

    try {
      await login({ email, password })
      navigate(state?.from?.pathname ?? '/atendimento', { replace: true })
    } catch (caughtError) {
      setError(getLoginErrorMessage(caughtError))
    } finally {
      setSubmittingProvider(null)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runLogin('atendimento')
  }

  async function handleInternalChatLogin() {
    setError('')
    setSubmittingProvider('internal-chat')

    try {
      const ssoState = createSsoState()
      const redirectUri = `${window.location.origin}/login/internal-chat/callback`

      window.sessionStorage.setItem(internalChatSsoStateKey, ssoState)
      window.sessionStorage.setItem(internalChatSsoReturnToKey, state?.from?.pathname ?? '/atendimento')

      const authorizeUrl = await authApi.getInternalChatAuthorizeUrl({
        redirectUri,
        state: ssoState,
      })

      window.location.assign(authorizeUrl)
    } catch (caughtError) {
      window.sessionStorage.removeItem(internalChatSsoStateKey)
      window.sessionStorage.removeItem(internalChatSsoReturnToKey)
      setError(getLoginErrorMessage(caughtError))
      setSubmittingProvider(null)
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            AN
          </span>
          <div>
            <p className="eyebrow">Central segura</p>
            <h1 id="login-title">{appConfig.appTitle}</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="email">
            E-mail
          </label>
          <div className="input-shell">
            <Mail size={18} aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <label className="field-label" htmlFor="password">
            Senha
          </label>
          <div className="input-shell">
            <Lock size={18} aria-hidden="true" />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="login-actions">
            <button className="primary-action" type="submit" disabled={submitting}>
              <LogIn size={18} aria-hidden="true" />
              {submittingProvider === 'atendimento' ? 'Entrando...' : 'Entrar'}
            </button>
            <button
              className="secondary-action login-provider-action"
              type="button"
              disabled={submitting}
              onClick={() => void handleInternalChatLogin()}
            >
              <MessageCircle size={18} aria-hidden="true" />
              {submittingProvider === 'internal-chat'
                ? 'Abrindo chat interno...'
                : 'Entrar com chat interno'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
