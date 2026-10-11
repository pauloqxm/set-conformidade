import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuth } from '../auth/AuthProvider'
import { ProcessTable } from './DashboardPage'
import { useWorkspace } from '../data/useWorkspace'
import { saveProcess } from '../lib/api'
import { AREAS, folderId } from '../lib/domain'

const schema = z.object({
  area: z.string().min(2),
  project_name: z.string().trim().min(2, 'Informe o projeto.'),
  kind: z.string().trim().min(2, 'Informe o tipo de instrumento.'),
  instrument_title: z.string().trim().min(2, 'Informe a identificação do instrumento.'),
  nup: z.string().trim(),
  object: z.string().trim(),
  process_stage: z.string().trim(),
  drive_folder_url: z.string().trim(),
  responsible_name: z.string().trim().min(2, 'Informe o responsável.'),
})

export function ProcessesPage() {
  const { session, profile } = useAuth()
  const { data, isLoading, error } = useWorkspace()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (isLoading) return <p className="muted">Carregando processos...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const form = event.currentTarget
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)))
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
      return
    }
    const url = parsed.data.drive_folder_url
    const id = url ? folderId(url) : null
    if (url && !id) {
      setMessage('O link precisa ser de uma pasta do Google Drive.')
      return
    }
    setBusy(true)
    try {
      await saveProcess(
        {
          ...parsed.data,
          drive_folder_id: id,
          responsible_email: session?.user.email ?? '',
        },
        session?.user.id ?? '',
      )
      await client.invalidateQueries({ queryKey: ['workspace'] })
      form.reset()
      setOpen(false)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">Cadastro</p>
          <h1>Processos</h1>
        </div>
        <button className="button" type="button" onClick={() => setOpen(true)}>
          Novo processo
        </button>
      </div>
      <p className="note">A sincronização da pasta do Drive continua na função do servidor. Aqui o processo é registrado com o link e os dados conferidos.</p>
      <ProcessTable processes={data.processes} items={data.items} />
      {open ? (
        <div className="overlay">
          <form className="dialog" onSubmit={(event) => void onSubmit(event)}>
            <h2>Novo processo</h2>
            <div className="grid">
              <label>
                Coordenação
                <select name="area" defaultValue={profile?.area ?? 'COEMP'}>
                  {AREAS.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Projeto
                <input name="project_name" required />
              </label>
              <label>
                Tipo de instrumento
                <input name="kind" required />
              </label>
              <label>
                Identificação
                <input name="instrument_title" required />
              </label>
              <label>
                NUP
                <input name="nup" />
              </label>
              <label>
                Etapa
                <input name="process_stage" />
              </label>
              <label className="wide">
                Objeto
                <textarea name="object" rows={3} />
              </label>
              <label className="wide">
                Link da pasta do Drive
                <input name="drive_folder_url" placeholder="https://drive.google.com/drive/folders/..." />
              </label>
              <label className="wide">
                Responsável
                <input name="responsible_name" defaultValue={profile?.full_name ?? ''} required />
              </label>
            </div>
            {message ? <p className="alert">{message}</p> : null}
            <div className="actions">
              <button className="ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="button" disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar processo'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
