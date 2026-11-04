import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { InternalChatCallbackPage } from './pages/InternalChatCallbackPage'
import { AtendimentoPage } from './pages/AtendimentoPage'
import { MonitoringPage } from './pages/MonitoringPage'
import { FinalizadosPage } from './pages/FinalizadosPage'
import { AuditoriaTicketsPage } from './pages/AuditoriaTicketsPage'
import { VendasPage } from './pages/VendasPage'
import { AuditoriaVendasPage } from './pages/AuditoriaVendasPage'
import { DisparosPage } from './pages/DisparosPage'
import { AutomationsPage } from './pages/AutomationsPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/internal-chat/callback" element={<InternalChatCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/atendimento" element={<AtendimentoPage />} />
        <Route path="/atendimento/:conversationId" element={<AtendimentoPage />} />
        <Route path="/monitoramento" element={<MonitoringPage />} />
        <Route path="/finalizados" element={<FinalizadosPage />} />
        <Route path="/auditoria/tickets" element={<AuditoriaTicketsPage />} />
        <Route path="/vendas" element={<VendasPage />} />
        <Route path="/auditoria/vendas" element={<AuditoriaVendasPage />} />
        <Route path="/disparos" element={<DisparosPage />} />
        <Route path="/automacoes" element={<AutomationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/atendimento" replace />} />
    </Routes>
  )
}

export default App
