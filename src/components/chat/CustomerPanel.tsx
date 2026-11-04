import { AlertTriangle, CalendarClock, FileText, History, ListChecks, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ConversationDetail, TicketMetadataLine } from '../../types/domain'
import { getCloseReasonLabel } from '../../utils/closeReasons'
import { getConversationTagLabel } from '../../utils/conversationTags'
import { formatDateTime } from '../../utils/dates'
import { maskCpf } from '../../utils/security'
import { DetailsSkeleton } from '../shared/Skeleton'
import { StatusBadge } from '../shared/StatusBadge'

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>{value?.trim() ? value : 'Não informado'}</dd>
    </div>
  )
}

function LineList({ lines }: { lines?: TicketMetadataLine[] }) {
  if (!lines?.length) return null

  return (
    <dl className="detail-lines">
      {lines.map((line) => (
        <div className="detail-line" key={`${line.label}-${line.value}`}>
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function formatAddress(conversation: ConversationDetail): string | undefined {
  const contract = conversation.ticketMetadata?.contract
  return [contract?.addressLine, contract?.city, contract?.state].filter(Boolean).join(', ') || undefined
}

function getTicketDescription(conversation: ConversationDetail): string | undefined {
  return (
    conversation.ticketMetadata?.ticket?.description ??
    conversation.ticketMetadata?.diagnosis?.structuredDescription
  )
}

export function CustomerPanel({
  conversation,
  loading,
  children,
}: {
  conversation: ConversationDetail | null
  loading: boolean
  children?: ReactNode
}) {
  const ticketNumber = conversation?.ticketNumber ?? conversation?.customer.ticketNumber
  const ticketDescription = conversation ? getTicketDescription(conversation) : undefined
  const answers = conversation?.ticketMetadata?.diagnosis?.answers
  const summary = conversation?.ticketMetadata?.diagnosis?.summary
  const closeReasonLabel = getCloseReasonLabel(conversation?.closeReason)

  return (
    <aside className="details-column" aria-label="Dados do cliente">
      <div className="column-heading">
        <h2>Cliente</h2>
      </div>

      {loading && <DetailsSkeleton />}

      {!loading && (
        <div className="details-content">
          {!conversation && (
            <div className="empty-state">
              <p>Os dados aparecem quando uma conversa é selecionada.</p>
            </div>
          )}

          {conversation && (
            <>
              <section className="customer-summary" aria-label="Resumo do cliente">
                <div className="customer-avatar" aria-hidden="true">
                  <UserRound size={24} />
                </div>
                <div>
                  <h3>{conversation.customer.name}</h3>
                  <p>Contrato {conversation.customer.contractNumber ?? 'não informado'}</p>
                </div>
              </section>

              <dl className="info-list">
                <InfoRow label="CPF" value={maskCpf(conversation.customer.document)} />
                <InfoRow label="Telefone" value={conversation.ticketMetadata?.customer?.phone} />
                <InfoRow label="Plano" value={conversation.customer.plan} />
                <InfoRow label="Endereço" value={formatAddress(conversation)} />
                <InfoRow label="Chamado" value={ticketNumber ? `#${ticketNumber}` : undefined} />
                <InfoRow label="Motivo" value={conversation.subject ?? conversation.customer.reason} />
                <div className="info-row">
                  <dt>Categorias</dt>
                  <dd>
                    {conversation.tags?.length ? (
                      <span className="detail-tags">
                        {conversation.tags.map((tag) => (
                          <span className="tag-chip compact" key={tag}>
                            {getConversationTagLabel(tag)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      'Não informado'
                    )}
                  </dd>
                </div>
                <InfoRow label="Classificação" value={conversation.ticketMetadata?.diagnosis?.classification} />
                <div className="info-row">
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={conversation.status} />
                  </dd>
                </div>
                <InfoRow label="Status SGP" value={conversation.customer.sgpStatus} />
                <InfoRow label="Abertura" value={formatDateTime(conversation.customer.openedAt)} />
                {conversation.closedAt && (
                  <InfoRow label="Encerramento" value={formatDateTime(conversation.closedAt)} />
                )}
                {closeReasonLabel && <InfoRow label="Motivo encerramento" value={closeReasonLabel} />}
                {conversation.closeReasonNote && (
                  <InfoRow label="Obs. encerramento" value={conversation.closeReasonNote} />
                )}
                {conversation.archivedAt && (
                  <InfoRow label="Arquivada em" value={formatDateTime(conversation.archivedAt)} />
                )}
              </dl>

              <section className="detail-section" aria-label="Chamado">
                <div className="section-title">
                  <FileText size={17} aria-hidden="true" />
                  <h3>Chamado</h3>
                </div>
                <p>{conversation.subject ?? conversation.customer.reason ?? 'Atendimento em aberto'}</p>
                {ticketDescription && <pre className="ticket-description">{ticketDescription}</pre>}
                <small>Responsável: {conversation.assignedAgentName ?? 'Ainda não assumido'}</small>
              </section>

              {Boolean(answers?.length || summary?.length) && (
                <section className="detail-section" aria-label="Triagem">
                  <div className="section-title">
                    <ListChecks size={17} aria-hidden="true" />
                    <h3>Triagem</h3>
                  </div>
                  <LineList lines={answers} />
                  <LineList lines={!answers?.length ? summary : undefined} />
                </section>
              )}

              <section className="detail-section" aria-label="Visita técnica">
                <div className="section-title">
                  <CalendarClock size={17} aria-hidden="true" />
                  <h3>Visita técnica</h3>
                </div>
                <dl className="mini-list">
                  <InfoRow label="Data" value={conversation.customer.visit?.dateLabel} />
                  <InfoRow label="Horário" value={conversation.customer.visit?.timeWindow} />
                  <InfoRow label="Técnico" value={conversation.customer.visit?.technicianName} />
                </dl>
              </section>

              {Boolean(conversation.customerHistory?.recentConversations.length) && (
                <section className="detail-section reincidente-section" aria-label="Histórico recente">
                  <div className="section-title">
                    <History size={17} aria-hidden="true" />
                    <h3>Histórico (30 dias)</h3>
                  </div>
                  <p className="reincidente-warning">
                    <AlertTriangle size={14} aria-hidden="true" />
                    {conversation.customerHistory?.recentCount} atendimento(s) recente(s) para este cliente.
                  </p>
                  <ul className="history-list">
                    {conversation.customerHistory?.recentConversations.map((entry) => (
                      <li key={entry.id}>
                        <span>{entry.ticketId ? `#${entry.ticketId}` : `Atendimento ${entry.id}`}</span>
                        <StatusBadge status={entry.status} />
                        <span>{formatDateTime(entry.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {children}
        </div>
      )}
    </aside>
  )
}
