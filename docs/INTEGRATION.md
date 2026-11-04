# Integração com a Chat API

Contrato REST e Socket.IO esperado pelo painel, fluxos implementados, macros, automações e pendências de backend.


Painel web independente para atendentes atenderem clientes que usam o chat no aplicativo mobile.

Este projeto é somente frontend. Ele não acessa MariaDB, SGP, intranet, NOC ou sistemas internos diretamente. Toda comunicação passa pela `acessanet-chat-api`.

## Stack

- React
- TypeScript
- Vite
- React Router
- Socket.IO Client
- Oxlint
- CSS próprio

## Variáveis de ambiente

Copie `.env.example` para `.env.local` no desenvolvimento.

```env
VITE_CHAT_API_URL=https://chat-api.example.com
VITE_USE_MOCK=false
```

`VITE_CHAT_API_URL` deve apontar para a Chat API. Se ficar vazio, o frontend usa caminhos relativos, útil quando um reverse proxy encaminha `/api` e Socket.IO para a API.

`VITE_USE_MOCK=true` habilita dados simulados somente para desenvolvimento. Builds de produção falham se essa variável estiver como `true`.

## Rotas

- `/login`
- `/atendimento`
- `/atendimento/:conversationId`

As rotas de atendimento são protegidas por `GET /api/agent/auth/me`. O app não considera o usuário autenticado apenas por existir dado local.

## Integração REST

Services centralizados em `src/services/api/`:

- `POST /api/agent/auth/login`
- `POST /api/agent/auth/internal-chat/login`
- `POST /api/agent/auth/refresh`
- `POST /api/agent/auth/logout`
- `GET /api/agent/auth/me`
- `PATCH /api/agent/users/me/status`
- `GET /api/agent/members`
- `PATCH /api/agent/users/:id/status`
- `PATCH /api/agent/users/:id/role`
- `GET /api/agent/conversations`
- `GET /api/agent/conversations/:id`
- `GET /api/agent/conversations/:id/messages`
- `POST /api/agent/conversations/:id/assign`
- `POST /api/agent/conversations/:id/unassign`
- `POST /api/agent/conversations/:id/transfer`
- `PATCH /api/agent/conversations/:id/status`
- `POST /api/agent/conversations/:id/read`
- `POST /api/agent/conversations/:id/archive`
- `POST /api/agent/conversations/:id/restore`
- `PATCH /api/agent/conversations/:id/tags`
- `DELETE /api/agent/conversations/:id`
- `GET /api/agent/agents`
- `GET /api/agent/internal-chat/agents`, proxy seguro da Chat API para presença do `chat-interno`

`GET /api/agent/auth/me`, `GET /api/agent/agents` e `GET /api/agent/members` devem retornar `role` e `attendanceStatus` ou `attendance_status`. Para o painel administrativo mostrar o tempo invisível, envie também `attendanceStatusChangedAt` ou `attendance_status_changed_at`.

Valores esperados:

- `role`: `attendant` ou `admin`. O frontend ainda aceita `agent` e `supervisor` por compatibilidade.
- `attendanceStatus`: `AVAILABLE` ou `INVISIBLE`.

`GET /api/agent/conversations` pode receber `filter`, `search`, `tag`, `sort` e `limit`. Valores de `tag`: `no_connection`, `billing`, `slowness`, `wifi`, `visit`, `cancellation`. Valores de `sort`: `priority`, `sla`, `unread`, `newest`, `oldest`.

O cliente HTTP usa `credentials: "include"` para suportar cookie HttpOnly. Caso a API retorne access token curto, ele fica apenas em memória.

## Integração Socket.IO

Service único em `src/services/socket/`, com implementação real e mock.

Eventos recebidos:

- `new_message`
- `conversation_created`
- `conversation_updated`
- `conversation_assigned`
- `conversation_transferred`
- `conversation_closed`
- `message_read`
- `typing`
- `user:status_changed`

Eventos emitidos:

- `join_conversation`
- `leave_conversation`
- `send_message`
- `typing_start`
- `typing_stop`
- `mark_read`

`user:status_changed` deve enviar:

```json
{
  "userId": "agent-lucas",
  "status": "INVISIBLE",
  "changedBy": "agent-ramon",
  "changedAt": "2026-09-12T13:42:00.000Z"
}
```

No `send_message`, o frontend envia também `agentId`, `authorName` e `technicianName` em camelCase e snake_case. APIs antigas podem ignorar esses campos; o painel ainda usa o usuário autenticado e o `senderId` retornado pela API para exibir o nome completo do técnico.

Na reconexão, o painel recarrega filas, reabre a conversa selecionada e busca mensagens recentes via REST.

## Componentes principais

- `DashboardHeader`: agente, conexão, som, notificações e indicadores.
- `ConversationList`: filtros, busca, fila, badges e botão Assumir.
- `ChatPanel`: histórico, paginação, typing, envio, retry e ações de status.
- `MessageComposer`: Enter para enviar, Shift+Enter para nova linha e respostas rápidas.
- `CustomerPanel`: dados fornecidos pela Chat API com CPF mascarado.
- `TransferDialog` e `ConfirmDialog`: ações sensíveis.

## Fluxos implementados

- Login real via API ou mock dev.
- Login opcional com credenciais do `chat-interno`, validado pela Chat API antes de emitir a sessão do atendimento.
- Refresh/session check com a API como fonte de verdade.
- Fila por filtros com contadores.
- Assumir atendimento via backend.
- Mensagens em tempo real via Socket.IO.
- `client_message_id` em toda mensagem enviada.
- Estados de envio: enviando, enviada e falha com retry.
- Não lidas, `mark_read`, título da aba com contador.
- Typing com debounce.
- Transferência somente visível para `supervisor` e `admin`.
- Encerramento com motivo e observação opcional.
- SLA visual de espera do cliente nas filas e no cabeçalho da conversa.
- Arquivamento e restauração de conversas.
- Categorias editáveis por conversa: Sem conexão, Financeiro, Lentidão, Wi-Fi, Visita e Cancelamento.
- Filtro por categoria, prioridade automática e ordenação por prioridade, SLA, não lidas, recentes ou antigos.
- Lista de atendentes conectados integrada ao `chat-interno` via proxy autenticado da Chat API.
- Mensagens do atendente exibidas com nome completo do técnico quando houver usuário autenticado, `authorName`, `agentName`, `technicianName` ou `senderId` compatível.
- Som discreto e Notification API opcionais.
- Skeletons, empty states e erros amigáveis.
- Status operacional do atendente no cabeçalho: Disponível ou Invisível.
- Área administrativa `Membros / Equipe` para usuários `admin`, com alteração de cargo e status de disponibilidade.

## Macros

Além das Respostas Rápidas (que só inserem um texto no campo de mensagem), o painel tem **Macros**: sequências de ações executadas em ordem dentro de um atendimento (enviar mensagem, (des)marcar categoria, ajustar prioridade, criar nota interna, transferir, consultar uma operação do backend e ramificar com condições). As duas funcionalidades coexistem e não se substituem.

Modelo e serviços: `src/types/macro.ts`, `src/services/api/macrosApi.ts`, `src/hooks/useMacros.ts`, `src/hooks/useMacroExecution.ts`, `src/components/macros/*`.

### Shortcuts

Digitar `/` no campo de mensagem mostra Respostas Rápidas **e** Macros que combinam com o texto (busca por atalho, nome, descrição e categoria), navegável com ↑ / ↓ / Enter / Esc. Selecionar uma macro não a executa imediatamente — abre um modal de confirmação com o resumo das ações. Há também um botão "⚡ Macros" dentro do campo de mensagem com busca, recentes e agrupamento por categoria (painel flutuante no desktop, bottom sheet no mobile).

### Ações suportadas

`SEND_MESSAGE`, `ADD_TAG`, `REMOVE_TAG`, `SET_PRIORITY`, `ADD_INTERNAL_NOTE`, `TRANSFER_QUEUE`, `WAIT`, `API_REQUEST`, `CONDITION` (operadores `EQUALS`, `NOT_EQUALS`, `EXISTS`, `NOT_EXISTS`, `CONTAINS`, `GREATER_THAN`, `LESS_THAN`). Os tipos `ASSIGN_AGENT`, `CLOSE_TICKET`, `ARCHIVE_TICKET`, `SET_CATEGORY`, `SET_STATUS`, `SEND_ATTACHMENT`, `RUN_DIAGNOSTIC` e `CREATE_TECHNICAL_TICKET` estão reservados no tipo `ReservedMacroActionType` para quando o backend expuser as operações correspondentes.

Textos de `SEND_MESSAGE`/`ADD_INTERNAL_NOTE` suportam variáveis seguras `{{customer.name}}`, `{{algumResultado.campo}}` (renderer próprio, sem `eval`). Cada ação aceita `onError: 'STOP' | 'CONTINUE'` (padrão `STOP`, pausa e pergunta ao atendente) e `confirm` opcional (pede confirmação manual antes de rodar aquela ação específica — usado por exemplo antes de transferir).

`API_REQUEST` nunca aceita URL arbitrária do frontend: só referencia uma `operation` (chave pré-autorizada no backend); o resultado fica disponível em `context.results[key]` para templates e condições seguintes.

### Execução

A execução roda sequencialmente com progresso visível (✓ sucesso, ⟳ em andamento, ○ pendente, ⚠ falha), bloqueando novas execuções da mesma macro no atendimento enquanto uma está em andamento (`useMacroExecution().locked`). Em caso de falha, o atendente escolhe "Tentar novamente", "Continuar" ou "Cancelar" — o erro nunca é escondido. Macros reaproveitam o mesmo envio de mensagem, a mesma API de tags/notas/transferência e o mesmo Socket.IO já usados pelo resto do painel; nenhuma lógica de execução foi colocada em `AtendimentoPage.tsx`.

### Permissões

Qualquer atendente autenticado pode executar uma macro. Criar, editar, duplicar, ativar/desativar e excluir exige `supervisor` ou `admin` (`canManageMacros` em `src/utils/security.ts`), com confirmação exigida para exclusão. Como em todo o painel, a validação real de permissão deve existir no backend — o frontend só evita mostrar a opção.

### Modo mock

Com `VITE_USE_MOCK=true`, `mockServer` cobre todo o CRUD de macros, execução, filas de transferência e as operações de `API_REQUEST`, incluindo as 6 macros de exemplo (`/semnet`, `/lentidao`, `/segunda-via`, `/troca-senha`, `/visita`, `/cancelamento`), sendo `/semnet` o fluxo completo com `CONDITION` e duas consultas de diagnóstico simuladas.

### Pendências de backend — Macros

Nenhum destes endpoints existe hoje na `acessanet-chat-api`. Em produção, até serem implementados, a ação correspondente falha de forma visível na execução (nunca finge sucesso):

- `GET/POST/PATCH/DELETE /api/agent/macros` e `POST /api/agent/macros/:id/execute` — CRUD e execução "oficial" de macros. Hoje, sem o motor no backend, o `useMacroExecution` roda as ações no frontend chamando os serviços reais já existentes um a um; `macrosApi.execute` é chamado de forma best-effort só para registro/auditoria.
- `GET /api/agent/macro-executions/:id` e eventos `macro:execution_*` via Socket.IO — acompanhamento de execução vindo do backend (hoje o progresso é só local, calculado pelo próprio hook).
- `GET /api/agent/macro-queues` — mapeamento de "fila" (ex.: `SUPORTE_N2`) para um atendente real. Hoje não existe o conceito de fila no backend, só transferência direta para um `agentId` (`conversationsApi.transfer`, já real).
- `POST /api/agent/macro-operations/execute` — execução de operações pré-autorizadas usadas por `API_REQUEST` (ex.: `customerDiagnostic.connectionStatus`, `customerDiagnostic.regionalIncident`). A allowlist de operações deve viver inteiramente no backend.
- `PATCH /api/agent/conversations/:id/priority` — sobrescrita manual de prioridade usada por `SET_PRIORITY`. Hoje a prioridade é só calculada no frontend (`getConversationPriority`, a partir de tags/SLA/não lidas); o campo `priorityOverride` em `ConversationSummary` já existe no frontend para quando este endpoint existir.

## Automações

Além da Macro (o atendente dispara manualmente), o painel tem **Automações**: regras que o próprio sistema dispara sozinho quando um evento acontece, no modelo `QUANDO` (trigger) → `SE` (condições) → `ENTÃO` (ações). Editor vertical em `/automacoes` (menu lateral do Atendimento e barra de navegação das páginas satélite), não um canvas tipo n8n.

### Resposta rápida vs. Macro vs. Automação

- **Resposta rápida**: atalho que só insere um texto pronto no campo de mensagem.
- **Macro**: o atendente inicia manualmente uma sequência de ações dentro de um atendimento.
- **Automação**: o sistema inicia sozinho uma sequência de ações quando um evento acontece (nova mensagem, inatividade do cliente, SLA etc.), sem ação do atendente.

### Onde vive a execução

**Importante**: o motor de execução real (ouvir eventos, rodar timers, impedir loops, idempotência, rate limit) **não é implementado neste repositório**. Este projeto é só frontend (ver topo deste README) — o motor deve viver na `acessanet-chat-api`. Por decisão de escopo desta entrega, não alterei o repositório da chat-api; construí aqui o editor, a página `/automacoes`, os contratos de API e um motor de **pré-visualização local** para o botão "Testar automação", e documentei abaixo exatamente o que falta no backend.

Nenhum `setTimeout` roda no navegador para automações reais — isso quebraria com a aba fechada, página recarregada ou servidor reiniciado, e é proibido mesmo em espírito pela própria modelagem (triggers como `CUSTOMER_INACTIVE` e ações `WAIT` só fazem sentido executadas por um scheduler/job persistente no backend).

### Modelo

`src/types/automation.ts`:

- **Trigger** (`AutomationTrigger`, união discriminada por `type`): `TICKET_CREATED`, `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `TICKET_ASSIGNED`, `TICKET_TRANSFERRED`, `TICKET_CLOSED`, `TAG_ADDED`, `PRIORITY_CHANGED`, `CUSTOMER_INACTIVE` (+`minutes`), `AGENT_INACTIVE` (+`minutes`), `SLA_WARNING` (+`thresholdPercent`), `SLA_BREACHED`. Reservados em `ReservedAutomationTriggerType` (`CUSTOMER_ONLINE`, `REGIONAL_INCIDENT_STARTED`, `INVOICE_OVERDUE` etc.) para quando o backend expuser os eventos.
- **Condições** (`conditionGroups: AutomationConditionGroup[]`): grupos combinados entre si por AND; dentro de um grupo, as condições combinam por `AND` ou `OR`. Operadores: `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `NOT_CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `EXISTS`, `NOT_EXISTS`, `GREATER_THAN(_OR_EQUAL)`, `LESS_THAN(_OR_EQUAL)`, `IN`, `NOT_IN` — avaliados sem `eval`/`Function` (`src/utils/automationConditions.ts`, sobre o path-walker seguro compartilhado em `src/utils/safeExpressions.ts`, também usado pelas Macros).
- **Ações** (`AutomationAction`, união discriminada): `SEND_MESSAGE`, `ADD_TAG`, `REMOVE_TAG`, `SET_PRIORITY`, `TRANSFER_QUEUE`, `ASSIGN_AGENT`, `ADD_INTERNAL_NOTE`, `CLOSE_TICKET`, `ARCHIVE_TICKET`, `WAIT`, `RUN_MACRO` (reaproveita uma Macro existente, sem duplicar lógica), `API_OPERATION` (operação pré-autorizada, nunca URL arbitrária) e `CONDITION` (ramificação `then`/`else` dentro da própria sequência de ações — usada por exemplo para enviar uma mensagem diferente conforme o resultado de um `API_OPERATION`, como no exemplo "sem internet" abaixo). Reservadas em `ReservedAutomationActionType`.
- `priority` (ordem entre automações elegíveis para o mesmo evento) e `stopProcessing` (não processar outras automações depois desta).
- Templates `{{customer.name}}` reaproveitam o mesmo renderer das Macros (`renderMacroTemplate`), sem `eval`.

### Testar automação (dry-run)

Duas camadas, para o botão "Testar" sempre funcionar mesmo sem o motor no backend:

1. **Preview local** (`src/utils/automationPreview.ts`, hook `useAutomationPreview`): avalia o trigger e as condições contra dados de exemplo digitados pelo admin (mensagem, tags, prioridade, status, minutos sem resposta) e mostra quais ações rodariam — nunca chama `conversationsApi`/`chatSocket`, portanto nunca altera um atendimento real. `API_OPERATION` roda de verdade contra `macrosApi.runOperation` (mesma allowlist/mock das Macros) para o preview ser realista.
2. `automationsApi.test(id, input)` → `POST /api/agent/automations/:id/test` com `dryRun: true` — **pendente no backend**, seria a versão autoritativa (testa contra um ticket real sem efeitos colaterais). Em mock, usa o mesmo motor de preview local.

### Validação e avisos

`src/utils/automationValidation.ts` bloqueia "Salvar e ativar" se faltar trigger, ação, campo/valor de condição, ou se a fila/macro selecionada não existir mais. Se a automação envia mensagem ou encerra o atendimento, o editor mostra um aviso explícito antes de ativar.

### Permissões

`canViewAutomations` (`supervisor`/`admin`) controla a visibilidade do item de navegação; `canManageAutomations` (só `admin`) controla criar/editar/ativar/pausar/duplicar/excluir (`src/utils/security.ts`). Testar e ver histórico ficam abertos a qualquer atendente autenticado, assim como a listagem — como em todo o painel, a validação de verdade deve existir no backend.

### Auditoria

`auditApi` é só leitura (ver seção de Macros). No mock, `createAutomation`/`updateAutomation`/`deleteAutomation`/`enableAutomation`/`disableAutomation` gravam `AUTOMATION_CREATED`/`AUTOMATION_UPDATED`/`AUTOMATION_DELETED`/`AUTOMATION_ENABLED`/`AUTOMATION_DISABLED` via o mesmo `addAuditLog` interno já usado por outras entidades. Os eventos de execução (`AUTOMATION_TRIGGERED`/`AUTOMATION_COMPLETED`/`AUTOMATION_FAILED`) só existirão de verdade quando o motor rodar no backend.

### Modo mock

Com `VITE_USE_MOCK=true`, `mockServer` cobre todo o CRUD, habilitar/pausar, teste (dry-run) e histórico de execuções, com 5 automações de exemplo (`Classificar cliente sem conexão`, `Segunda via de fatura`, `Encerrar atendimento por inatividade`, `SLA próximo do limite`, `Risco de cancelamento`) em status variados (`ACTIVE`/`DRAFT`/`PAUSED`) e um histórico de execuções de exemplo (incluindo uma falha com `OLT_SERVICE_TIMEOUT`, para a tela de detalhe).

### Pendências de backend — Automações

Nenhum destes endpoints existe hoje na `acessanet-chat-api`. Em produção, até serem implementados, a chamada correspondente falha de forma visível (nunca finge sucesso):

- `GET/POST/PATCH/DELETE /api/agent/automations`, `POST /api/agent/automations/:id/enable|disable|test` — CRUD, ativação e teste autoritativo.
- `GET /api/agent/automation-executions` e `GET /api/agent/automation-executions/:id` — histórico real de execuções.
- **O motor de execução em si**: ouvir os eventos do próprio backend (nova mensagem, ticket criado/transferido/encerrado, tag adicionada, SLA) e dos jobs de inatividade/SLA; rodar trigger → condições → ações; persistir timers (`WAIT`, `CUSTOMER_INACTIVE`, `AGENT_INACTIVE`) como jobs duráveis, não em memória do processo Node nem no navegador.
- **Cancelamento de timer por resposta do cliente**: antes de cada `WAIT` de uma cadeia de inatividade retomar, o motor precisa confirmar que nenhuma mensagem do cliente chegou nesse meio-tempo; se chegou, cancelar a cadeia em vez de continuar.
- **Anti-loop**: `executionId`/`parentExecutionId`/profundidade (ex.: `MAX_AUTOMATION_DEPTH = 10`) para impedir que uma automação disparada por outra (ex.: `TAG_ADDED` disparado por uma ação `ADD_TAG`) entre em ciclo.
- **Idempotência**: dedupe por `eventId` — o mesmo evento de Socket.IO entregue duas vezes não deve executar a automação duas vezes.
- **Rate limit**: limites configuráveis de ações por execução, mensagens automáticas por minuto e automações encadeadas.
- **Concorrência**: se o atendente e uma automação tentarem alterar o mesmo ticket ao mesmo tempo (fechar, transferir, atribuir, mudar prioridade), ou se o ticket já estiver fechado, a ação da automação deve ser `SKIPPED` ou falhar de forma controlada, nunca sobrescrever silenciosamente.
- **Ordem entre automações concorrentes**: quando várias automações forem elegíveis para o mesmo evento, executar por `priority` crescente, respeitando `stopProcessing`.
- `PATCH /api/agent/conversations/:id/assignee` (com `agentId` explícito) — usado por `ASSIGN_AGENT`. Hoje `POST /api/agent/conversations/:id/assign` só atribui ao usuário autenticado, não a um agente arbitrário.
- Eventos Socket.IO opcionais `automation:execution_started|completed|failed` (não é necessário transmitir cada micro-passo).

## Contrato de cargos e disponibilidade

Este repositório não contém banco de dados nem o algoritmo real de distribuição de chamados. A `acessanet-chat-api` deve persistir e validar a regra no backend.

Campos sugeridos:

- `users.role`, com padrão `attendant`.
- `users.attendance_status`, com padrão `AVAILABLE`.
- `users.attendance_status_changed_at`, atualizado sempre que `attendance_status` mudar.
- `user_status_logs`, com `id`, `user_id`, `old_status`, `new_status`, `changed_by` e `created_at`.

Permissões esperadas:

- `attendant` pode alterar somente o próprio `attendance_status`.
- `admin` pode alterar o status de qualquer usuário, alterar cargos de outros usuários e listar `Membros / Equipe`.
- usuários não-admin não podem alterar cargos pela API.

Distribuição automática:

- a seleção automática de atendente deve considerar apenas usuários com `attendance_status = 'AVAILABLE'`.
- usuários `INVISIBLE` continuam autenticados, navegando e respondendo chamados existentes.

## Modo mock

Use em desenvolvimento quando a `acessanet-chat-api` ainda não estiver disponível:

```env
VITE_USE_MOCK=true
```

O mock cobre login, lista, assumir, mensagens, typing, novas conversas, status, transferência, encerramento com motivo, categorias, presença de atendentes, cargos, disponibilidade operacional, área de equipe, arquivamento, restauração e exclusão. Não deve ser usado em produção.

## Como rodar

```bash
npm install
npm run dev
```

## Verificações

```bash
npm run lint
npm run typecheck
npm run build
```

## Build de produção

```bash
VITE_CHAT_API_URL=https://chat-api.example.com VITE_USE_MOCK=false npm run build
```

O resultado fica em `dist/`.

## Pendências externas

- Configurar DNS para `atendimento.example.com`.
- Publicar a Chat API em `https://chat-api.example.com`.
- Ajustar CORS na `acessanet-chat-api` para o domínio do painel.
- Configurar cookies `Secure`, `HttpOnly` e `SameSite` conforme domínio final.
- Configurar Cloudflare Access ou reverse proxy fora deste frontend.
- Confirmar o endpoint real de listagem de atendentes se não for `GET /api/agent/agents`.
- Confirmar o formato exato dos payloads Socket.IO e nomes de campos caso a API real divirja.
