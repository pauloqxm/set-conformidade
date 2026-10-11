import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { listAssignable, saveAssignment, saveItem } from '../lib/api'
import { AREAS, ITEM_STATUSES, pendingKind, pendingLabel, projectName } from '../lib/domain'
import type { AssignableUser, ChecklistItem, ItemDraft } from '../lib/types'

export function PendingPage() {
  const { session } = useAuth()
  const { data, isLoading, error } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const project = params.get('projeto') ?? ''
  const areaParam = params.get('area') ?? ''
  const [text, setText] = useState('')
  const [area, setArea] = useState(areaParam)
  useEffect(() => setArea(areaParam), [areaParam])
  const [kind, setKind] = useState('')
  const [current, setCurrent] = useState<ChecklistItem | null>(null)

  const rows = useMemo(() => {
    if (!data) return []
    return data.items.filter((item) => {
      const process = data.processes.find((row) => row.id === item.process_id)
      if (!process) return false
      if (project && projectName(process.project_name) !== project) return false
      if (area && process.area !== area) return false
      const itemKind = pendingKind(item.status, item.validated)
      if (kind && itemKind !== kind) return false
      if (itemKind === 'validado' && !kind) return false
      const blob = `${process.nup ?? ''} ${process.project_name ?? ''} ${item.code ?? ''} ${item.finding ?? ''} ${item.criterion ?? ''}`.toLowerCase()
      return !text || blob.includes(text.toLowerCase())
    })
  }, [data, project, area, kind, text])

  if (isLoading) return <p className="muted">Carregando pendências...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">Pendências</p>
          <h1>Itens que ainda exigem ação</h1>
        </div>
      </div>
      {project ? (
        <p className="note">
          Projeto: <b>{project}</b>{' '}
          <button className="ghost" type="button" onClick={() => setParams({})}>
            Ver todos
          </button>
        </p>
      ) : null}
      <div className="filters">
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Buscar NUP, projeto ou ocorrência" />
        <select value={area} onChange={(event) => setArea(event.target.value)}>
          <option value="">Todas as coordenações</option>
          {AREAS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="">Em aberto</option>
          <option value="aberto">Não conforme</option>
          <option value="resolucao">Em resolução</option>
          <option value="revisao">Revisão técnica</option>
          <option value="validacao">Aguardando validação</option>
          <option value="validado">Validados</option>
        </select>
      </div>
      <section className="stack">
        {rows.length === 0 ? <p className="muted">Nenhuma pendência com esses filtros.</p> : null}
        {rows.map((item) => {
          const process = data.processes.find((row) => row.id === item.process_id)
          const itemKind = pendingKind(item.status, item.validated)
          return (
            <article className={`pending ${itemKind}`} key={item.id}>
              <div>
                <small>{process?.nup || 'Sem NUP'} · {projectName(process?.project_name)}</small>
                <b>{item.code ? `${item.code} · ` : ''}{item.criterion || item.finding || 'Item do checklist'}</b>
              </div>
              <div>
                <span>{process?.area}</span>
                <span>{item.resolution_area || 'Área não informada'}</span>
                <span>{item.technician_name || 'Sem responsável'}</span>
              </div>
              <p>{item.finding || item.notes || 'Sem ocorrência registrada.'}</p>
              <div className="actions">
                <span className={`pill ${itemKind}`}>{pendingLabel(item.status, item.validated)}</span>
                <button className="ghost" type="button" onClick={() => setCurrent(item)}>
                  Abrir
                </button>
              </div>
            </article>
          )
        })}
      </section>
      {current && session?.user ? (
        <ItemDialog
          item={current}
          userId={session.user.id}
          onClose={() => setCurrent(null)}
        />
      ) : null}
    </div>
  )
}

function ItemDialog({ item, userId, onClose }: { item: ChecklistItem; userId: string; onClose: () => void }) {
  const client = useQueryClient()
  const { data } = useWorkspace()
  const process = data?.processes.find((row) => row.id === item.process_id)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState<AssignableUser[] | null>(null)

  async function ensurePeople() {
    if (people || !process) return
    try {
      setPeople(await listAssignable(process.id))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível listar os responsáveis.')
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const draft: ItemDraft = {
      status: String(form.get('status') ?? ''),
      suite_page: String(form.get('suite_page') ?? ''),
      finding: String(form.get('finding') ?? ''),
      resolution_area: String(form.get('resolution_area') ?? ''),
      technician_name: String(form.get('technician_name') ?? ''),
      deadline_start: String(form.get('deadline_start') ?? ''),
      deadline_end: String(form.get('deadline_end') ?? ''),
      procedure_adopted: String(form.get('procedure_adopted') ?? ''),
      pending_observation: String(form.get('pending_observation') ?? ''),
      validated: form.get('validated') === 'on',
      extra_drive_url: String(form.get('extra_drive_url') ?? ''),
      expected_updated_at: item.updated_at,
    }
    setBusy(true)
    setMessage('')
    try {
      await saveItem(item.id, draft, userId)
      const assignedTo = String(form.get('assigned_to') ?? '')
      if (assignedTo) {
        const current = data?.assignments.find(
          (row) => row.checklist_item_id === item.id && row.status !== 'Cancelada' && row.assigned_to === assignedTo,
        )
        await saveAssignment({
          id: current?.id,
          checklistItemId: item.id,
          processId: item.process_id,
          assignedTo,
          assignedBy: userId,
          note: String(form.get('assignment_note') ?? ''),
          procedure: draft.procedure_adopted,
          deadlineStart: draft.deadline_start,
          deadlineEnd: draft.deadline_end,
          keepStatus: current?.status,
        })
      }
      await client.invalidateQueries({ queryKey: ['workspace'] })
      onClose()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay">
      <form className="dialog" onSubmit={(event) => void onSubmit(event)}>
        <h2>{item.code || 'Item'} · {process?.nup || projectName(process?.project_name)}</h2>
        <p className="muted">{item.criterion}</p>
        <div className="grid">
          <label>
            Situação
            <select name="status" defaultValue={item.status ?? 'Não conforme'}>
              {ITEM_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Páginas
            <input name="suite_page" defaultValue={item.suite_page ?? ''} />
          </label>
          <label>
            Área responsável
            <input name="resolution_area" defaultValue={item.resolution_area ?? process?.area ?? ''} />
          </label>
          <label>
            Responsável
            <input name="technician_name" defaultValue={item.technician_name ?? ''} />
          </label>
          <label>
            Prazo inicial
            <input name="deadline_start" type="date" defaultValue={item.deadline_start ?? ''} />
          </label>
          <label>
            Prazo final
            <input name="deadline_end" type="date" defaultValue={item.deadline_end ?? ''} />
          </label>
          <label className="wide">
            Ocorrência
            <textarea name="finding" rows={3} defaultValue={item.finding ?? ''} />
          </label>
          <label className="wide">
            Procedimento adotado
            <textarea name="procedure_adopted" rows={3} defaultValue={item.procedure_adopted ?? ''} />
          </label>
          <label className="wide">
            Observação
            <textarea name="pending_observation" rows={2} defaultValue={item.pending_observation ?? ''} />
          </label>
          <label className="wide">
            Link complementar do Drive
            <input name="extra_drive_url" defaultValue={item.extra_drive_url ?? ''} />
          </label>
          <label className="wide">
            Atribuir a
            <select name="assigned_to" defaultValue="" onFocus={() => void ensurePeople()}>
              <option value="">Não alterar</option>
              {(people ?? []).map((person) => (
                <option key={person.user_id} value={person.user_id}>
                  {person.full_name || person.email} · {person.area}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Orientação da solicitação
            <input name="assignment_note" />
          </label>
          <label className="check wide">
            <input name="validated" type="checkbox" defaultChecked={!!item.validated} />
            Item regular e validado
          </label>
        </div>
        {message ? <p className="alert">{message}</p> : null}
        <div className="actions">
          <button className="ghost" type="button" onClick={onClose}>
            Fechar
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
