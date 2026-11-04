import { MessageSquareText } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { quickRepliesApi } from '../../services/api/quickRepliesApi'
import type { QuickReply } from '../../types/domain'
import { getReadableError } from '../../utils/errors'

interface QuickRepliesAdminDialogProps {
  open: boolean
  onClose(): void
}

const emptyForm = { shortcut: '', title: '', body: '', category: '' }

export function QuickRepliesAdminDialog({ open, onClose }: QuickRepliesAdminDialogProps) {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setError('')
    quickRepliesApi
      .list(true)
      .then(setReplies)
      .catch((err) => setError(getReadableError(err, 'Não foi possível carregar as respostas rápidas.')))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.shortcut.trim() || !form.title.trim() || !form.body.trim()) return

    setSaving(true)
    setError('')

    try {
      if (editingId) {
        const updated = await quickRepliesApi.update(editingId, {
          shortcut: form.shortcut,
          title: form.title,
          body: form.body,
          category: form.category || null,
        })
        setReplies((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      } else {
        const created = await quickRepliesApi.create({
          shortcut: form.shortcut,
          title: form.title,
          body: form.body,
          category: form.category || undefined,
        })
        setReplies((current) => [...current, created])
      }
      resetForm()
    } catch (err) {
      setError(getReadableError(err, 'Não foi possível salvar a resposta rápida.'))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(reply: QuickReply) {
    setEditingId(reply.id)
    setForm({
      shortcut: reply.shortcut,
      title: reply.title,
      body: reply.body,
      category: reply.category ?? '',
    })
  }

  async function toggleActive(reply: QuickReply) {
    setError('')
    try {
      const updated = await quickRepliesApi.update(reply.id, { active: !reply.active })
      setReplies((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(getReadableError(err, 'Não foi possível atualizar a resposta rápida.'))
    }
  }

  async function remove(reply: QuickReply) {
    setError('')
    try {
      await quickRepliesApi.remove(reply.id)
      setReplies((current) => current.filter((item) => item.id !== reply.id))
      if (editingId === reply.id) resetForm()
    } catch (err) {
      setError(getReadableError(err, 'Não foi possível excluir a resposta rápida.'))
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-panel wide-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-replies-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-icon">
          <MessageSquareText size={22} aria-hidden="true" />
        </div>
        <h2 id="quick-replies-title">Respostas rápidas</h2>
        <p className="modal-subtitle">
          Atalhos que os atendentes acessam digitando &quot;/&quot; no campo de mensagem.
        </p>

        {error && <p className="form-error">{error}</p>}

        <form className="quick-reply-form" onSubmit={handleSubmit}>
          <div className="quick-reply-form-row">
            <label className="field-label">
              Atalho
              <input
                className="select-input"
                value={form.shortcut}
                onChange={(event) => setForm((current) => ({ ...current, shortcut: event.target.value }))}
                placeholder="/boleto"
                maxLength={40}
              />
            </label>
            <label className="field-label">
              Categoria
              <input
                className="select-input"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                placeholder="Financeiro"
                maxLength={60}
              />
            </label>
          </div>
          <label className="field-label">
            Título
            <input
              className="select-input"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Segunda via de boleto"
              maxLength={120}
            />
          </label>
          <label className="field-label">
            Mensagem
            <textarea
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="Texto que será inserido no campo de mensagem"
              rows={3}
              maxLength={2000}
            />
          </label>
          <div className="modal-actions">
            {editingId && (
              <button type="button" className="secondary-action" onClick={resetForm}>
                Cancelar edição
              </button>
            )}
            <button
              type="submit"
              className="primary-action compact"
              disabled={saving || !form.shortcut.trim() || !form.title.trim() || !form.body.trim()}
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar'}
            </button>
          </div>
        </form>

        <div className="quick-reply-list">
          {loading && <p>Carregando...</p>}
          {!loading && replies.length === 0 && <p className="empty-state">Nenhuma resposta rápida cadastrada.</p>}
          {!loading &&
            replies.map((reply) => (
              <div className={`quick-reply-row ${reply.active ? '' : 'inactive'}`} key={reply.id}>
                <div className="quick-reply-row-info">
                  <strong>{reply.shortcut}</strong>
                  <span>{reply.title}</span>
                  {reply.category && <span className="tag-chip compact">{reply.category}</span>}
                  {!reply.active && <span className="tag-chip compact">Inativa</span>}
                </div>
                <div className="quick-reply-row-actions">
                  <button type="button" className="secondary-action compact" onClick={() => startEdit(reply)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="secondary-action compact"
                    onClick={() => void toggleActive(reply)}
                  >
                    {reply.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action danger-secondary compact"
                    onClick={() => void remove(reply)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>
    </div>
  )
}
