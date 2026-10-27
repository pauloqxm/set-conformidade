import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import {
  connectDrive,
  deleteDriveSource,
  driveStatus,
  loadDriveSources,
  readDriveFolder,
  saveProcess,
  type DriveSource,
} from '../lib/api'
import { AREAS, canManage, folderId, projectName } from '../lib/domain'
import type { ProcessRow } from '../lib/types'

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

type Draft = z.infer<typeof schema> & { id?: string; drive_source_id?: string | null }

export function ProcessesPage() {
  const { session, profile } = useAuth()
  const { data, isLoading, error } = useWorkspace()
  const client = useQueryClient()
  const drive = useQuery({ queryKey: ['drive-status'], queryFn: driveStatus, retry: false })
  const sources = useQuery({ queryKey: ['drive-sources'], queryFn: loadDriveSources, retry: false })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  if (!canManage(profile)) return <Navigate to="/" replace />
  if (isLoading) return <p className="muted">Carregando processos...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  const connected = !!drive.data?.connected
  const rows = folderRows(sources.data, data.processes)

  async function reconnect() {
    setMessage('')
    setBusy('conectar')
    try {
      const url = await connectDrive()
      const popup = window.open(url, 'setGoogleDriveAuth', 'width=680,height=780')
      if (!popup) throw new Error('O navegador bloqueou a janela de autorização. Permita pop-ups neste site.')
      const started = Date.now()
      const timer = window.setInterval(() => {
        void driveStatus()
          .then((status) => {
            if (status.connected || Date.now() - started > 120000) {
              window.clearInterval(timer)
              popup.close()
              void client.invalidateQueries({ queryKey: ['drive-status'] })
            }
          })
          .catch(() => undefined)
      }, 1800)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível conectar o Drive.')
    } finally {
      setBusy('')
    }
  }

  async function linkFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const form = event.currentTarget
    const url = String(new FormData(form).get('drive_folder_url') ?? '').trim()
    const id = folderId(url)
    if (!id) {
      setMessage('Informe um link válido de pasta do Google Drive.')
      return
    }
    if (!connected) {
      setMessage('Conecte o Google Drive antes de vincular a pasta.')
      return
    }
    setBusy('ler')
    try {
      const read = await readDriveFolder(url)
      await client.invalidateQueries({ queryKey: ['drive-sources'] })
      const source = (sources.data ?? []).find((item) => item.drive_folder_id === id)
      const existing = data?.processes.find((process) => process.drive_folder_id === id || process.drive_source_id === source?.id)
      const detected = read.detected ?? {}
      setDraft({
        id: existing?.id,
        area: existing?.area || detected.area || profile?.area || 'COEMP',
        project_name: existing?.project_name || detected.project || '',
        kind: existing?.kind || detected.kind || '',
        instrument_title: existing?.instrument_title || detected.instrument_title || read.root?.name || '',
        nup: existing?.nup || '',
        object: existing?.object || '',
        process_stage: existing?.process_stage || '',
        drive_folder_url: url,
        responsible_name: existing?.responsible_name || profile?.full_name || '',
        drive_source_id: source?.id ?? existing?.drive_source_id ?? null,
      })
      form.reset()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível ler a pasta.')
    } finally {
      setBusy('')
    }
  }

  function editRow(row: FolderRow) {
    const process = row.process
    setDraft({
      id: process?.id,
      area: process?.area || row.area || profile?.area || 'COEMP',
      project_name: process?.project_name || row.project || '',
      kind: process?.kind || row.kind || '',
      instrument_title: process?.instrument_title || row.title,
      nup: process?.nup || '',
      object: process?.object || '',
      process_stage: process?.process_stage || '',
      drive_folder_url: row.url || '',
      responsible_name: process?.responsible_name || profile?.full_name || '',
      drive_source_id: row.sourceId,
    })
  }

  async function syncRow(row: FolderRow) {
    if (!row.url) return
    if (!connected) {
      setMessage('Conecte o Google Drive antes de sincronizar a pasta.')
      return
    }
    setBusy(row.key)
    setMessage('')
    try {
      await readDriveFolder(row.url)
      await client.invalidateQueries({ queryKey: ['drive-sources'] })
      await client.invalidateQueries({ queryKey: ['workspace'] })
      setMessage('Pasta sincronizada. Os documentos atuais do Drive foram relidos.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível sincronizar.')
    } finally {
      setBusy('')
    }
  }

  async function removeRow(row: FolderRow) {
    const accepted = window.confirm(
      `Deseja excluir ${row.title}? A pasta será removida do sistema, mas o conteúdo original no Google Drive não será apagado.`,
    )
    if (!accepted || !row.sourceId) return
    setBusy(row.key)
    setMessage('')
    try {
      await deleteDriveSource(row.sourceId)
      await client.invalidateQueries({ queryKey: ['drive-sources'] })
      await client.invalidateQueries({ queryKey: ['workspace'] })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível excluir a pasta.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="cadastro">
      <div className="heading">
        <div>
          <p className="eyebrow gold">Cadastro</p>
          <h1>Cadastro de processos</h1>
        </div>
      </div>
      <section className="driveHero">
        <div className="driveMark" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path fill="#0F9D58" d="M23 8h17l17 29-8.5 15H32L14.8 22z" />
            <path fill="#F4B400" d="M14.8 22 6 37l8.6 15h17.4l-8.7-15z" />
            <path fill="#4285F4" d="M57 37H23.3L14.6 52h33.9z" />
          </svg>
        </div>
        <p className="heroKicker">Vincular processo</p>
        <h2>Vincular pasta do Google Drive</h2>
        <p>Selecione a pasta principal do instrumento para iniciar o cadastro.</p>
        <div className={`driveStatus${connected ? ' online' : ''}`}>
          <span />
          <div>
            <b>{drive.isLoading ? 'Verificando Google Drive' : connected ? 'Google Drive conectado' : 'Google Drive desconectado'}</b>
            <small>{connected ? drive.data?.email || 'Conta autorizada' : 'Conecte o Drive para vincular e sincronizar a pasta.'}</small>
          </div>
          <button type="button" onClick={() => void reconnect()} disabled={busy === 'conectar'}>
            {connected ? 'Reconectar' : 'Conectar'}
          </button>
        </div>
        <form onSubmit={(event) => void linkFolder(event)}>
          <input name="drive_folder_url" type="url" required placeholder="Cole aqui o link da pasta principal do Google Drive" />
          <button className="button" disabled={!connected || busy === 'ler'}>
            {busy === 'ler' ? 'Lendo pasta...' : 'Vincular e ler pasta'}
          </button>
        </form>
        {message ? <p className="alert">{message}</p> : null}
      </section>
      <section className="linkedPanel">
        <div className="linkedHead">
          <div>
            <p className="eyebrow">Drive</p>
            <h2>Pastas vinculadas</h2>
          </div>
          <b>{rows.length}</b>
        </div>
        {rows.length === 0 ? <p className="muted">Nenhuma pasta vinculada.</p> : null}
        {rows.map((row) => (
          <article key={row.key}>
            <span className="folderMini" aria-hidden="true">▰</span>
            <div>
              <b>{row.title}</b>
              <small>{row.trail}</small>
            </div>
            {row.pill ? <em>{row.pill}</em> : null}
            <strong>{row.state}</strong>
            <div className="sourceButtons">
              <button type="button" onClick={() => editRow(row)}>Editar</button>
              <button type="button" onClick={() => void syncRow(row)} disabled={busy === row.key}>Sincronizar</button>
              <button type="button" onClick={() => row.url && window.open(row.url, '_blank', 'noopener')}>Drive</button>
              <button type="button" className="danger" onClick={() => void removeRow(row)} disabled={!row.sourceId || busy === row.key}>Excluir</button>
            </div>
          </article>
        ))}
      </section>
      {draft ? (
        <ProcessDialog
          draft={draft}
          busy={busy === 'salvar'}
          onClose={() => setDraft(null)}
          onSubmit={async (event) => {
            event.preventDefault()
            const form = event.currentTarget
            const parsed = schema.safeParse(Object.fromEntries(new FormData(form)))
            if (!parsed.success) {
              setMessage(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
              return
            }
            const id = folderId(parsed.data.drive_folder_url)
            if (parsed.data.drive_folder_url && !id) {
              setMessage('O link precisa ser de uma pasta do Google Drive.')
              return
            }
            setBusy('salvar')
            try {
              await saveProcess(
                {
                  ...parsed.data,
                  id: draft.id,
                  drive_folder_id: id,
                  drive_source_id: draft.drive_source_id,
                  responsible_email: session?.user.email ?? '',
                },
                session?.user.id ?? '',
              )
              await client.invalidateQueries({ queryKey: ['workspace'] })
              setDraft(null)
              setMessage('')
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Não foi possível salvar.')
            } finally {
              setBusy('')
            }
          }}
        />
      ) : null}
    </div>
  )
}

type FolderRow = {
  key: string
  sourceId: string | null
  process: ProcessRow | null
  title: string
  trail: string
  pill: string
  state: string
  url: string | null
  area: string
  project: string
  kind: string
}

function folderRows(sources: DriveSource[] | undefined, processes: ProcessRow[]): FolderRow[] {
  if (sources?.length) {
    return sources.map((source) => {
      const process = processes.find((item) => item.drive_source_id === source.id || item.drive_folder_id === source.drive_folder_id) ?? null
      const title = source.detected_instrument_title || process?.instrument_title || process?.nup || 'Pasta vinculada'
      const project = source.detected_project || projectName(process?.project_name)
      const trail = [source.area || process?.area, project, process?.process_stage].filter(Boolean).join(' · ')
      return {
        key: source.id,
        sourceId: source.id,
        process,
        title,
        trail: trail || source.drive_folder_id || 'Pasta do Drive',
        pill: source.detected_kind || process?.kind || '',
        state: source.read_status === 'Aguardando leitura' ? 'Aguardando' : source.read_status || 'Identificado',
        url: source.drive_folder_url || process?.drive_folder_url || null,
        area: source.area || process?.area || '',
        project,
        kind: source.detected_kind || process?.kind || '',
      }
    })
  }
  return processes
    .filter((process) => process.drive_folder_url || process.drive_folder_id)
    .map((process) => ({
      key: process.id,
      sourceId: process.drive_source_id ?? null,
      process,
      title: process.instrument_title || process.nup || 'Pasta vinculada',
      trail: [process.area, projectName(process.project_name), process.process_stage].filter(Boolean).join(' · '),
      pill: process.kind || '',
      state: 'Identificado',
      url: process.drive_folder_url,
      area: process.area,
      project: projectName(process.project_name),
      kind: process.kind || '',
    }))
}

function ProcessDialog({
  draft,
  busy,
  onClose,
  onSubmit,
}: {
  draft: Draft
  busy: boolean
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}) {
  return (
    <div className="overlay">
      <form className="dialog" onSubmit={(event) => void onSubmit(event)}>
        <h2>{draft.id ? 'Editar processo' : 'Conferir cadastro'}</h2>
        <p className="muted">Confira os dados identificados na pasta antes de salvar.</p>
        <div className="grid">
          <label>
            Coordenação
            <select name="area" defaultValue={draft.area}>
              {AREAS.map((area) => (
                <option key={area.id} value={area.id}>{area.id}</option>
              ))}
            </select>
          </label>
          <label>
            Projeto
            <input name="project_name" defaultValue={draft.project_name} required />
          </label>
          <label>
            Tipo de instrumento
            <input name="kind" defaultValue={draft.kind} required />
          </label>
          <label>
            Identificação
            <input name="instrument_title" defaultValue={draft.instrument_title} required />
          </label>
          <label>
            NUP
            <input name="nup" defaultValue={draft.nup} />
          </label>
          <label>
            Etapa
            <input name="process_stage" defaultValue={draft.process_stage} />
          </label>
          <label className="wide">
            Objeto
            <textarea name="object" rows={3} defaultValue={draft.object} />
          </label>
          <label className="wide">
            Link da pasta do Drive
            <input name="drive_folder_url" defaultValue={draft.drive_folder_url} />
          </label>
          <label className="wide">
            Responsável
            <input name="responsible_name" defaultValue={draft.responsible_name} required />
          </label>
        </div>
        <div className="actions">
          <button className="ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar processo'}</button>
        </div>
      </form>
    </div>
  )
}
