import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { cleanStageTitle } from '../lib/checklistDocx'
import {
  connectDrive,
  deleteDriveSource,
  driveStatus,
  loadDriveSources,
  loadModulePreview,
  readDriveFolder,
  saveProcess,
  type ChecklistMatch,
  type DriveRead,
  type DriveSource,
} from '../lib/api'
import { COORDINATIONS, canManage, folderId, projectName } from '../lib/domain'
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

type Draft = z.infer<typeof schema> & {
  id?: string
  drive_source_id?: string | null
  responsible_email: string
  matches?: ChecklistMatch[]
}

export function ProcessesPage() {
  const { session, profile } = useAuth()
  const { data, isLoading, error } = useWorkspace()
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const drive = useQuery({ queryKey: ['drive-status'], queryFn: driveStatus, retry: false })
  const sources = useQuery({ queryKey: ['drive-sources'], queryFn: loadDriveSources, retry: false })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    const editId = params.get('editar')
    if (!editId || !data) return
    const process = data.processes.find((item) => item.id === editId)
    const next = new URLSearchParams(params)
    next.delete('editar')
    setParams(next, { replace: true })
    if (!process) return
    setDraft({
      id: process.id,
      area: process.area || profile?.area || 'COEMP',
      project_name: process.project_name || '',
      kind: process.kind || '',
      instrument_title: process.instrument_title || '',
      nup: process.nup || '',
      object: process.object || '',
      process_stage: process.process_stage || '',
      drive_folder_url: process.drive_folder_url || '',
      responsible_name: process.responsible_name || profile?.full_name || '',
      responsible_email: process.responsible_email || session?.user.email || '',
      drive_source_id: process.drive_source_id ?? null,
    })
  }, [params, data, profile?.area, profile?.full_name, session?.user.email, setParams])

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
      const refreshed = await loadDriveSources()
      await client.invalidateQueries({ queryKey: ['drive-sources'] })
      const source = refreshed.find((item) => item.drive_folder_id === id || item.id === read.source_id)
      const existing = data?.processes.find((process) => process.drive_folder_id === id || process.drive_source_id === source?.id)
      const detected = read.detected ?? {}
      setDraft({
        id: existing?.id,
        area: existing?.area || detected.area || profile?.area || 'COEMP',
        project_name: existing?.project_name || detected.project || '',
        kind: existing?.kind || detected.kind || '',
        instrument_title: existing?.instrument_title || detected.instrument_title || read.root?.name || '',
        nup: existing?.nup || nupFromRead(read),
        object: existing?.object || '',
        process_stage: existing?.process_stage || stageFromRead(read),
        drive_folder_url: url,
        responsible_name: existing?.responsible_name || profile?.full_name || '',
        responsible_email: existing?.responsible_email || session?.user.email || '',
        drive_source_id: source?.id ?? existing?.drive_source_id ?? read.source_id ?? null,
        matches: matchesFromRead(read),
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
      responsible_email: process?.responsible_email || session?.user.email || '',
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
        {message ? <p className={message.startsWith('Processo salvo') || message.startsWith('Pasta sincronizada') ? 'oknote' : 'alert'}>{message}</p> : null}
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
                  responsible_email: draft.responsible_email || session?.user.email || '',
                  matches: draft.matches,
                },
                session?.user.id ?? '',
              )
              await client.invalidateQueries({ queryKey: ['workspace'] })
              const linked = draft.matches?.length ?? 0
              setDraft(null)
              setMessage(linked ? `Processo salvo. ${linked} checklist(s) vinculado(s) à estrutura encontrada.` : 'Processo salvo. Nenhum checklist correspondente foi localizado ainda.')
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
  const [preview, setPreview] = useState<string>('')
  const [items, setItems] = useState<{ id: string; item_code: string | null; verification: string | null; responsible: string | null; basis: string | null }[]>([])
  const [previewError, setPreviewError] = useState('')
  const nodes = [draft.area, draft.project_name, draft.instrument_title, draft.process_stage].filter(Boolean)
  const sectors = COORDINATIONS.some((area) => area.id === draft.area) ? COORDINATIONS : [{ id: draft.area, name: draft.area }, ...COORDINATIONS]
  const matches = draft.matches ?? []

  async function showItems(moduleId: string) {
    if (preview === moduleId) {
      setPreview('')
      return
    }
    setPreview(moduleId)
    setPreviewError('')
    try {
      setItems(await loadModulePreview(moduleId))
    } catch (error) {
      setItems([])
      setPreviewError(error instanceof Error ? error.message : 'Não foi possível carregar os itens.')
    }
  }

  return (
    <div className="overlay">
      <form className="dialog processDialog" onSubmit={(event) => void onSubmit(event)}>
        <div className="hierarchyBox">
          <div className="hierarchyTitle">Estrutura identificada no Drive</div>
          <div className="hierarchyFlow">
            {nodes.map((node, index) => (
              <span key={`${node}-${index}`} className="hierarchyStep">
                {index > 0 ? <span className="hierarchyArrow">›</span> : null}
                <span className="hierarchyNode">{node}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="grid">
          <label>
            Coordenação / setor
            <select name="area" defaultValue={draft.area} required>
              {sectors.map((area) => (
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
            Identificação do instrumento
            <input name="instrument_title" defaultValue={draft.instrument_title} required />
          </label>
          <label>
            Etapa / tipo de processo
            <input name="process_stage" defaultValue={draft.process_stage} placeholder="Ex.: CELEBRAÇÃO" />
          </label>
          <label>
            NUP / nº do processo
            <input name="nup" defaultValue={draft.nup} placeholder="Identificado pelo nome do PDF" />
            <span className="readonlyHint">Quando o nome do PDF contém 17 dígitos, o NUP é formatado automaticamente. Você pode corrigir se necessário.</span>
          </label>
          <label>
            Responsável pelo upload
            <input name="responsible_name" defaultValue={draft.responsible_name} readOnly required />
            <span className="readonlyHint">{draft.responsible_email}</span>
          </label>
          <label className="wide">
            Objeto
            <textarea name="object" rows={3} defaultValue={draft.object} placeholder="Informe ou ajuste o objeto do processo" />
          </label>
          <label className="wide">
            Link da pasta principal
            <input name="drive_folder_url" defaultValue={draft.drive_folder_url} required />
            <span className="readonlyHint">O link pode ser corrigido aqui antes de salvar.</span>
          </label>
        </div>
        {draft.matches && matches.length === 0 ? (
          <div className="checkMatchBox warn">
            <strong>Nenhum checklist correspondente localizado</strong>
            <span>Você pode salvar o cadastro mesmo assim. Quando as chaves do checklist forem ajustadas, sincronize a pasta novamente.</span>
          </div>
        ) : null}
        {matches.length > 0 ? (
          <div className="checkMatchBox">
            <strong>{matches.length === 1 ? 'Checklist correspondente localizado' : 'Checklists correspondentes localizados'}</strong>
            {matches.map((match) => (
              <div className="checkMatch" key={`${match.module_id}-${match.folder_id}`}>
                <div>
                  <b>{match.title || 'Checklist'}</b>
                  <small>
                    {match.template_name || 'Checklist cadastrado'}
                    {match.folder_name ? ` · Pasta: ${match.folder_name}` : ''}
                  </small>
                </div>
                <button type="button" onClick={() => void showItems(match.module_id)}>Ver itens</button>
              </div>
            ))}
            {preview ? (
              <div className="matchPreview">
                {previewError ? <p className="alert">{previewError}</p> : null}
                {items.map((item) => (
                  <p key={item.id}>
                    <b>{item.item_code}</b> {item.verification}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="actions">
          <button className="ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar processo e vincular checklist'}</button>
        </div>
      </form>
    </div>
  )
}

function matchesFromRead(read: DriveRead): ChecklistMatch[] {
  return (read.matched_modules ?? [])
    .filter((item) => item.module_id && item.template_id)
    .map((item) => ({
      template_id: item.template_id || '',
      template_name: item.template_name || '',
      module_id: item.module_id || '',
      title: cleanStageTitle(item.module_title),
      folder_id: item.folder_id || '',
      folder_name: item.folder_name || '',
      folder_path: item.folder_path || '',
    }))
}

function stageFromRead(read: DriveRead) {
  const names = [...new Set((read.matched_modules ?? []).map((item) => item.folder_name).filter(Boolean))]
  if (names.length) return names.join(' / ')
  const folders = (read.items ?? []).filter((item) => item.is_folder).map((item) => item.name || '')
  return folders.find((name) => /CELEBRA|ADITIV|PRESTA|FISCALIZ|ACOMPANH/i.test(name)) || ''
}

function nupFromRead(read: DriveRead) {
  for (const item of read.items ?? []) {
    if (item.is_folder) continue
    const found = nupFromName(item.name || '')
    if (found) return found
  }
  return ''
}

function nupFromName(name: string) {
  const match = name.match(/(?:^|\D)(\d{17})(?:\D|$)/)
  if (!match?.[1]) return ''
  const digits = match[1]
  return `${digits.slice(0, 5)}.${digits.slice(5, 11)}/${digits.slice(11, 15)}-${digits.slice(15)}`
}
