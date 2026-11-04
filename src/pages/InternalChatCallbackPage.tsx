import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, LoaderCircle, MessageCircle } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { appConfig } from '../config'
import { useAuth } from '../hooks/useAuth'
import {
  internalChatSsoReturnToKey,
  internalChatSsoStateKey,
} from '../services/api/authApi'

function callbackErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    access_denied: 'O login com chat interno foi cancelado.',
    invalid_state: 'A validação de segurança do login expirou. Tente novamente.',
    missing_code: 'O chat interno não retornou o código de login.',
    internal_chat_sso_invalid: 'O código do chat interno expirou. Tente novamente.',
    agent_not_registered: 'Seu e-mail do chat interno ainda não está cadastrado como atendente.',
    agent_disabled: 'Seu usuário de atendimento está desativado.',
  }

  return messages[error] ?? 'Não foi possível concluir o login com chat interno.'
}

export function InternalChatCallbackPage() {
  const { loginWithInternalChatCode } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const ranRef = useRef(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    async function finishLogin() {
      const returnedError = searchParams.get('error')
      const code = searchParams.get('code')
      const returnedState = searchParams.get('state')
      const expectedState = window.sessionStorage.getItem(internalChatSsoStateKey)
      const returnTo = window.sessionStorage.getItem(internalChatSsoReturnToKey) || '/atendimento'

      window.sessionStorage.removeItem(internalChatSsoStateKey)
      window.sessionStorage.removeItem(internalChatSsoReturnToKey)

      if (returnedError) {
        setError(callbackErrorMessage(returnedError))
        return
      }

      if (!code) {
        setError(callbackErrorMessage('missing_code'))
        return
      }

      if (!expectedState || !returnedState || expectedState !== returnedState) {
        setError(callbackErrorMessage('invalid_state'))
        return
      }

      try {
        await loginWithInternalChatCode({
          code,
          redirectUri: `${window.location.origin}/login/internal-chat/callback`,
        })
        setDone(true)
        navigate(returnTo.startsWith('/') ? returnTo : '/atendimento', { replace: true })
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : ''
        setError(callbackErrorMessage(message))
      }
    }

    void finishLogin()
  }, [loginWithInternalChatCode, navigate, searchParams])

  return (
    <main className="login-page">
      <section className="login-panel sso-callback-panel" aria-labelledby="sso-callback-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            AN
          </span>
          <div>
            <p className="eyebrow">Central segura</p>
            <h1 id="sso-callback-title">{appConfig.appTitle}</h1>
          </div>
        </div>

        <div className="sso-callback-state">
          {error ? (
            <>
              <MessageCircle size={34} aria-hidden="true" />
              <h2>Login não concluído</h2>
              <p className="form-error" role="alert">{error}</p>
              <Link className="secondary-action login-provider-action" to="/login">
                Voltar ao login
              </Link>
            </>
          ) : done ? (
            <>
              <CheckCircle2 size={34} aria-hidden="true" />
              <h2>Entrada autorizada</h2>
            </>
          ) : (
            <>
              <LoaderCircle className="spin-icon" size={34} aria-hidden="true" />
              <h2>Concluindo entrada...</h2>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
