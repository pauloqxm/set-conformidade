import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { saveItem } from '../lib/api'
import { ITEM_STATUSES, isClosed, projectName } from '../lib/domain'
import type { ChecklistItem } from '../lib/types'

export function AnalysisPage() {
  const { session } = useAuth()
  const { data, isLoading, error } = useWorkspace()
  const client = useQueryClient()
  const [params] = useSearchParams()
  const [processId, setProcessId] = useState(params.get('processo') ?? '')
  useEffect(() => {
    const requested = params.get('processo')
    if (requested) setProcessId(requested)
  }, [params])
  const [message, setMessage] = useState('')

  const items = useMemo(
    () => (data?.items ?? []).filter((item) => item.process_id === processId).sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0)),
    [data, processId],
  )
  const counts = {
    conforme: items.filter((item) => item.status === 'Conforme').length,
    nao: items.filter((item) => item.status === 'Não conforme').length,
    na: items.filter((item) => item.status === 'Não se aplica').length,
    revisao: items.filter((item) => item.status === 'Revisão técnica necessária').length,
    fechados: items.filter((item) => isClosed(item.status, item.validated)).length,
  }

  if (isLoading) return <p className="muted">Carregando análises...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  async function changeStatus(item: ChecklistItem, status: string) {
    if (!session?.user) return
    setMessage('')
    try {
      await saveItem(
        item.id,
        {
          status,
          suite_page: item.suite_page ?? '',
          finding: item.finding ?? '',
          resolution_area: item.resolution_area ?? '',
          technician_name: item.technician_name ?? '',
          deadline_start: item.deadline_start ?? '',
          deadline_end: item.deadline_end ?? '',
          procedure_adopted: item.procedure_adopted ?? '',
          pending_observation: item.pending_observation ?? '',
          validated: !!item.validated,
          extra_drive_url: item.extra_drive_url ?? '',
          expected_updated_at: item.updated_at,
        },
        session.user.id,
      )
      await client.invalidateQueries({ queryKey: ['workspace'] })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar.')
    }
  }

  let section = ''
  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">Revisão</p>
          <h1>Análises gravadas</h1>
        </div>
        <select value={processId} onChange={(event) => setProcessId(event.target.value)}>
          <option value="">Escolha um processo</option>
          {data.processes.map((process) => (
            <option key={process.id} value={process.id}>
              {process.nup || process.instrument_title || projectName(process.project_name)}
            </option>
          ))}
        </select>
      </div>
      <p className="note">A nova leitura dos PDFs, com OCR, fica no servidor. Esta tela revisa o que já foi analisado e permite corrigir o status de cada item.</p>
      {message ? <p className="alert">{message}</p> : null}
      {processId ? (
        <section className="metrics">
          <article><span>Conforme</span><strong>{counts.conforme}</strong></article>
          <article><span>Não conforme</span><strong>{counts.nao}</strong></article>
          <article><span>Não se aplica</span><strong>{counts.na}</strong></article>
          <article><span>Revisão</span><strong>{counts.revisao}</strong></article>
          <article><span>Validados</span><strong>{counts.fechados}</strong></article>
        </section>
      ) : null}
      <section className="stack">
        {processId && items.length === 0 ? <p className="muted">Este processo ainda não tem itens de checklist.</p> : null}
        {items.map((item) => {
          const showSection = item.section && item.section !== section
          if (item.section) section = item.section
          return (
            <div key={item.id}>
              {showSection ? <h2>{item.section}</h2> : null}
              <article className="panel">
                <b>{item.code ? `${item.code} · ` : ''}{item.criterion || 'Item'}</b>
                <p>{item.finding || item.analysis || 'Sem constatação registrada.'}</p>
                <small className="muted">Páginas: {item.suite_page || '—'}</small>
                <label>
                  Situação
                  <select value={item.status ?? ''} onChange={(event) => void changeStatus(item, event.target.value)}>
                    {!ITEM_STATUSES.includes((item.status ?? '') as (typeof ITEM_STATUSES)[number]) && item.status ? (
                      <option value={item.status}>{item.status}</option>
                    ) : null}
                    {ITEM_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            </div>
          )
        })}
      </section>
    </div>
  )
}
