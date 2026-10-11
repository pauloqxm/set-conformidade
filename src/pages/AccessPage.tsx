import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { approveAccess, loadInactiveProfiles } from '../lib/api'
import { AREAS } from '../lib/domain'

export function AccessPage() {
  const { profile } = useAuth()
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const query = useQuery({
    queryKey: ['inactive-profiles'],
    queryFn: loadInactiveProfiles,
    enabled: !!profile?.is_admin,
  })

  if (!profile?.is_admin) return <Navigate to="/" replace />
  if (query.isLoading) return <p className="muted">Carregando solicitações de acesso...</p>
  if (query.error) return <p className="alert">{query.error instanceof Error ? query.error.message : 'Não foi possível carregar.'}</p>

  async function approve(userId: string, form: HTMLFormElement) {
    const data = new FormData(form)
    setMessage('')
    try {
      await approveAccess(userId, String(data.get('area')), data.get('is_admin') === 'on')
      await client.invalidateQueries({ queryKey: ['inactive-profiles'] })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível aprovar.')
    }
  }

  const rows = query.data ?? []
  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">Administração</p>
          <h1>Solicitações de acesso</h1>
        </div>
      </div>
      {message ? <p className="alert">{message}</p> : null}
      <section className="stack">
        {rows.length === 0 ? <p className="muted">Nenhuma solicitação pendente.</p> : null}
        {rows.map((row) => (
          <form
            className="panel approval"
            key={row.user_id}
            onSubmit={(event) => {
              event.preventDefault()
              void approve(row.user_id, event.currentTarget)
            }}
          >
            <div>
              <b>{row.full_name || row.email}</b>
              <p className="muted">{row.email}</p>
            </div>
            <label>
              Coordenação
              <select name="area" defaultValue={row.area}>
                {AREAS.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input name="is_admin" type="checkbox" />
              Administrador
            </label>
            <button className="button">Aprovar</button>
          </form>
        ))}
      </section>
    </div>
  )
}
