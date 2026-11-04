const rawApiUrl = import.meta.env.VITE_CHAT_API_URL?.trim() ?? ''
const rawUseMock = import.meta.env.VITE_USE_MOCK?.trim().toLowerCase() ?? 'false'

const useMock = rawUseMock === 'true'

if (import.meta.env.PROD && useMock) {
  throw new Error('VITE_USE_MOCK must be false in production builds.')
}

export const appConfig = {
  appTitle: 'AcessaNet Atendimento',
  apiUrl: rawApiUrl.replace(/\/+$/, ''),
  useMock,
}
