import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { deleteProcess, loadProfiles } from '../lib/api'
import { COORDINATIONS, personName } from '../lib/domain'
import type { Assignment, ProcessRow, Profile } from '../lib/types'

type Tab = 'analysis' | 'sector' | 'sent' | 'done'

const TABS: { id: Tab; label: string }[] = [
  { id: 'analysis', label: 'Em análise' },
  { id: 'sector', label: 'No setor' },
  { id: 'sent', label: 'Encaminhados' },
  { id: 'done', label: 'Finalizados' },
]

export function AreaPage() {
  const { area = '' } = useParams()
  const code = area.toUpperCase()
  const coordination = COORDINATIONS.find((item) => item.id === code)
  const { session, profile } = useAuth()
  const { data, isLoading, error } = useWorkspace()
  const people = useQuery({ queryKey: ['profiles'], queryFn: loadProfiles, retry: false })
  const client = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('sector')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  const allowed = !!profile?.is_admin || (!!profile?.is_manager && profile.area === code)
  const rows = useMemo(() => (data?.processes ?? []).filter((process) => process.area === code), [data?.processes, code])
  const buckets = useMemo(() => groupProcesses(rows, data?.assignments ?? [], session?.user.id ?? ''), [rows, data?.assignments, session?.user.id])
  const shown = buckets[tab]
  const visible = shown.filter((process) => matches(process, query))

  if (!coordination) return <p className="alert">Coordenação não encontrada.</p>
  if (!allowed) return <p className="alert">Você não possui acesso a este setor.</p>
  if (isLoading) return <p className="muted">Carregando processos...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  async function remove(process: ProcessRow) {
    const label = process.nup || process.instrument_title || process.project_name || 'este processo'
    const accepted = window.confirm(`Deseja excluir ${label} do sistema? A análise, pendências e vínculos internos desse processo serão removidos. A pasta e os arquivos originais no Google Drive não serão apagados.`)
    if (!accepted) return
    setBusy(process.id)
    setMessage('')
    try {
      await deleteProcess(process.id)
      await client.invalidateQueries({ queryKey: ['workspace'] })
      setMessage('Processo excluído do sistema.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível excluir o processo.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">{coordination.id}</p>
          <h1>Processos da {coordination.name}</h1>
        </div>
      </div>
      {message ? <p className={message.startsWith('Processo excluído') ? 'oknote' : 'alert'}>{message}</p> : null}
      <section className="processBoard">
        <div className="boardHead">
          <div className="boardTitle">
            <div>
              <h2>Painel de Processos</h2>
              <p>{rows.length} registro(s) nesta coordenação</p>
            </div>
            <b>{shown.length}</b>
          </div>
          <div className="boardTabs">
            {TABS.map((item) => (
              <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
                <TabIcon tab={item.id} />
                <span>{item.label}</span>
                <b>{buckets[item.id].length}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="boardSearch">
          <SearchIcon />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquise um processo" />
        </div>
        <div className="boardColumns">
          <span>Processo / assunto</span>
          <span>Atualizado</span>
          <span>Situação</span>
          <span>Ações</span>
        </div>
        {visible.length === 0 ? <p className="boardEmpty">Nenhum processo encontrado nesta situação.</p> : null}
        {visible.map((process) => {
          const status = situation(process, data.assignments, session?.user.id ?? '', people.data ?? [], tab)
          const when = updatedAt(process)
          const hasItems = data.items.some((item) => item.process_id === process.id)
          return (
            <article
              key={process.id}
              className="boardRow"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/pendencias?processo=${process.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') navigate(`/pendencias?processo=${process.id}`)
              }}
            >
              <div className="boardMain">
                <span className="boardDoc" aria-hidden="true">
                  <DocIcon />
                </span>
                <div>
                  <b>
                    {process.nup || process.instrument_title || process.project_name || 'Processo'} - {process.kind || process.process_stage || 'Processo'}
                  </b>
                  <span>De: SET/{process.area || '—'}</span>
                  <small>Observação: {process.object || process.instrument_title || process.project_name || '—'}</small>
                </div>
              </div>
              <div className="boardWhen">
                {when.date}
                {when.time ? <small>Atualizado às {when.time}</small> : null}
              </div>
              <div className="boardStatus">
                <b>{status.text}</b>
                <span className={status.cls}>{status.label}</span>
              </div>
              <div className="boardActions">
                {process.drive_folder_url ? (
                  <a href={process.drive_folder_url} target="_blank" rel="noreferrer" title="Abrir pasta no Drive" onClick={(event) => event.stopPropagation()}>
                    <FolderIcon />
                  </a>
                ) : null}
                {hasItems ? (
                  <button type="button" title="Ver análise" onClick={(event) => { event.stopPropagation(); navigate(`/analises?processo=${process.id}`) }}>
                    <SearchIcon />
                  </button>
                ) : null}
                <button type="button" title="Editar processo" onClick={(event) => { event.stopPropagation(); navigate(`/processos?editar=${process.id}`) }}>
                  <EditIcon />
                </button>
                {profile?.is_admin ? (
                  <button type="button" className="danger" title="Excluir processo" disabled={busy === process.id} onClick={(event) => { event.stopPropagation(); void remove(process) }}>
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function groupProcesses(rows: ProcessRow[], assignments: Assignment[], userId: string) {
  const buckets: Record<Tab, ProcessRow[]> = { analysis: [], sector: [], sent: [], done: [] }
  for (const process of rows) {
    const state = flowOf(process, assignments)
    if (state.active.length) buckets.analysis.push(process)
    if (!state.active.length && !state.finalized) buckets.sector.push(process)
    if (state.active.some((item) => item.assigned_by === userId && item.assigned_to !== userId)) buckets.sent.push(process)
    if (state.finalized) buckets.done.push(process)
  }
  return buckets
}

function flowOf(process: ProcessRow, assignments: Assignment[]) {
  const related = assignments
    .filter((item) => item.process_id === process.id && item.status !== 'Cancelada')
    .slice()
    .sort((a, b) => String(b.updated_at || b.assigned_at || '').localeCompare(String(a.updated_at || a.assigned_at || '')))
  const active = related.filter((item) => item.status === 'Nova' || item.status === 'Em andamento')
  const done = related.filter((item) => item.status === 'Concluída')
  return { active, finalized: process.status === 'Concluído' || (!active.length && done.length > 0), current: active[0] }
}

function situation(process: ProcessRow, assignments: Assignment[], userId: string, people: Profile[], tab: Tab) {
  const state = flowOf(process, assignments)
  if (tab === 'done' || state.finalized) return { cls: 'finalizado', label: 'Finalizado', text: 'Processo finalizado' }
  if (state.current) {
    const person = people.find((item) => item.user_id === state.current?.assigned_to)
    const sent = state.current.assigned_by === userId && state.current.assigned_to !== userId
    return {
      cls: sent ? 'encaminhado' : 'analise',
      label: 'Em análise',
      text: `Em análise por ${person ? personName(person.full_name, person.email) : 'responsável'}`,
    }
  }
  return { cls: 'setor', label: 'No setor', text: 'Disponível no setor' }
}

function matches(process: ProcessRow, query: string) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  return `${process.nup ?? ''} ${process.project_name ?? ''} ${process.object ?? ''} ${process.kind ?? ''} ${process.instrument_title ?? ''}`.toLowerCase().includes(text)
}

function updatedAt(process: ProcessRow) {
  const date = new Date(process.updated_at || process.created_at || '')
  if (Number.isNaN(date.getTime())) return { date: '—', time: '' }
  return {
    date: date.toLocaleDateString('pt-BR'),
    time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

function TabIcon({ tab }: { tab: Tab }) {
  if (tab === 'analysis') return <SearchIcon />
  if (tab === 'sent') return <SendIcon />
  if (tab === 'done') return <CheckIcon />
  return <DocIcon />
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4M9 12h6M9 16h6" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7.5h7l2 2h9v9H3z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-7-6 14-3-6-7-1Z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </svg>
  )
}
