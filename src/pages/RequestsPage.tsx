import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { completeAssignment, markAssignment } from '../lib/api'
import { formatWhen, projectName } from '../lib/domain'

export function RequestsPage() {
  const { session } = useAuth()
  const { data, isLoading, error } = useWorkspace()
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [mine, setMine] = useState(true)

  if (isLoading) return <p className="muted">Carregando solicitações...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  const rows = data.assignments.filter((row) => !mine || row.assigned_to === session?.user.id)

  async function run(action: () => Promise<void>) {
    setMessage('')
    try {
      await action()
      await client.invalidateQueries({ queryKey: ['workspace'] })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível atualizar.')
    }
  }

  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">Fluxo</p>
          <h1>Solicitações</h1>
        </div>
        <label className="check">
          <input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} />
          Só as minhas
        </label>
      </div>
      {message ? <p className="alert">{message}</p> : null}
      <section className="stack">
        {rows.length === 0 ? <p className="muted">Nenhuma solicitação nesta visão.</p> : null}
        {rows.map((row) => {
          const process = data.processes.find((item) => item.id === row.process_id)
          const item = data.items.find((entry) => entry.id === row.checklist_item_id)
          return (
            <article className="panel" key={row.id}>
              <b>{item?.code ? `${item.code} · ` : ''}{item?.criterion || 'Pendência'}</b>
              <p className="muted">
                {process?.nup || projectName(process?.project_name)} · {row.status} · {formatWhen(row.assigned_at)}
              </p>
              <p>{row.note || 'Sem orientação.'}</p>
              <small>Situação: {row.status}</small>
              <div className="actions">
                {row.status === 'Nova' ? (
                  <button className="ghost" type="button" onClick={() => void run(() => markAssignment(row.id, 'Em andamento'))}>
                    Iniciar
                  </button>
                ) : null}
                {row.status !== 'Concluída' && row.status !== 'Cancelada' ? (
                  <button className="button" type="button" onClick={() => void run(() => completeAssignment(row.id))}>
                    Concluir
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
