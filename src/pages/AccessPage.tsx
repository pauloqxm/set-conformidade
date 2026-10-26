import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { approveAccess, loadProfiles, rejectAccess, updateUserProfile } from '../lib/api'
import { AREAS, roleLabel, roleOf } from '../lib/domain'
import type { AccessRole, Profile } from '../lib/types'

export function AccessPage() {
  const { profile } = useAuth()
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<Profile | null>(null)
  const query = useQuery({
    queryKey: ['profiles'],
    queryFn: loadProfiles,
    enabled: !!profile?.is_admin,
  })

  if (!profile?.is_admin) return <Navigate to="/" replace />
  if (query.isLoading) return <p className="muted">Carregando usuários...</p>
  if (query.error) return <p className="alert">{query.error instanceof Error ? query.error.message : 'Não foi possível carregar.'}</p>

  const rows = query.data ?? []
  const pending = rows.filter((row) => !row.active)
  const approved = rows.filter((row) => row.active)

  async function run(action: () => Promise<void>) {
    setMessage('')
    try {
      await action()
      await client.invalidateQueries({ queryKey: ['profiles'] })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível concluir.')
    }
  }

  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">Administração</p>
          <h1>Usuários e aprovações</h1>
        </div>
      </div>
      <p className="note">Usuário da área vê só o que foi atribuído a ele. Gestor vê a coordenação inteira. Administrador vê todas as áreas.</p>
      {message ? <p className="alert">{message}</p> : null}
      <section className="accessGrid">
        <div className="panel">
          <h2>Solicitações pendentes</h2>
          {pending.length === 0 ? <p className="muted">Nenhuma solicitação pendente.</p> : null}
          <div className="stack">
            {pending.map((row) => (
              <article key={row.user_id} className="approvalUser">
                <div>
                  <b>{row.full_name || row.email}</b>
                  <p className="muted">{row.email}</p>
                  <label>
                    Coordenação
                    <select id={`area-${row.user_id}`} defaultValue={row.area || 'COEMP'}>
                      {AREAS.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="actions">
                  <button className="button" type="button" onClick={() => void run(() => approve(row.user_id, 'user'))}>
                    Aprovar como usuário
                  </button>
                  <button className="ghost" type="button" onClick={() => void run(() => approve(row.user_id, 'manager'))}>
                    Aprovar como gestor
                  </button>
                  <button className="ghost" type="button" onClick={() => void run(() => approve(row.user_id, 'admin'))}>
                    Aprovar como administrador
                  </button>
                  <button className="ghost" type="button" onClick={() => void run(() => rejectAccess(row.user_id))}>
                    Recusar acesso
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>Usuários aprovados</h2>
          {approved.length === 0 ? <p className="muted">Nenhum usuário aprovado.</p> : null}
          <div className="stack">
            {approved.map((row) => (
              <article key={row.user_id} className="approvalUser">
                <div>
                  <b>{row.full_name || row.email}</b>
                  <p className="muted">
                    {row.area} · {roleLabel(roleOf(row))} · {row.email}
                  </p>
                </div>
                <button className="ghost" type="button" onClick={() => setEditing(row)}>
                  Editar cadastro
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>
      {editing ? (
        <EditUser
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await updateUserProfile(input)
            setEditing(null)
            await client.invalidateQueries({ queryKey: ['profiles'] })
          }}
        />
      ) : null}
    </div>
  )

  function approve(userId: string, role: AccessRole) {
    const select = document.getElementById(`area-${userId}`) as HTMLSelectElement | null
    return approveAccess(userId, select?.value || 'COEMP', role)
  }
}

function EditUser({
  row,
  onClose,
  onSave,
}: {
  row: Profile
  onClose: () => void
  onSave: (input: { userId: string; fullName: string; area: string; role: AccessRole; active: boolean }) => Promise<void>
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="overlay">
      <form
        className="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          setBusy(true)
          setMessage('')
          void onSave({
            userId: row.user_id,
            fullName: String(form.get('full_name') ?? '').trim(),
            area: String(form.get('area') ?? row.area),
            role: String(form.get('role') ?? 'user') as AccessRole,
            active: form.get('active') === 'true',
          })
            .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Não foi possível salvar.'))
            .finally(() => setBusy(false))
        }}
      >
        <h2>Editar cadastro do usuário</h2>
        <div className="grid">
          <label className="wide">
            Nome completo
            <input name="full_name" defaultValue={row.full_name ?? ''} required />
          </label>
          <label className="wide">
            E-mail institucional
            <input value={row.email ?? ''} disabled />
          </label>
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
          <label>
            Perfil de acesso
            <select name="role" defaultValue={roleOf(row)}>
              <option value="user">Usuário da área</option>
              <option value="manager">Gestor da área</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <label className="wide">
            Status
            <select name="active" defaultValue={row.active ? 'true' : 'false'}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </label>
        </div>
        <p className="note">Usuário: somente atribuições diretas. Gestor: processos e pendências da própria área. Administrador: acesso global.</p>
        {message ? <p className="alert">{message}</p> : null}
        <div className="actions">
          <button className="ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
