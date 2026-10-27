import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { cleanStageTitle, norm, type ParsedChecklist } from '../lib/checklistDocx'
import {
  connectDrive,
  driveStatus,
  excludeChecklistFile,
  listOf,
  loadOfficialChecklists,
  readOfficialChecklist,
  resetOfficialChecklists,
  saveApprovedInterpretation,
  saveDriveChecklist,
  syncChecklistFolder,
  type ChecklistDriveFile,
  type OfficialItem,
  type OfficialLibrary,
  type OfficialTemplate,
  type ReadProgress,
} from '../lib/api'
import { canManage } from '../lib/domain'

type EditItem = {
  key: string
  id?: string
  code: string
  verification: string
  basis: string
  interpretation: string
  evidence: string
  focus: string
  conform: string
  nonconform: string
  review: string
  terms: string
}

type EditModule = {
  key: string
  id?: string
  title: string
  keys: string
  items: EditItem[]
}

type EditModel = {
  name: string
  instrument: string
  fileName: string
  modules: EditModule[]
}

type Review =
  | { kind: 'approved'; model: EditModel }
  | { kind: 'draft'; file: ChecklistDriveFile; parsed: ParsedChecklist; model: EditModel }

export function ChecklistsPage() {
  const { session, profile } = useAuth()
  const client = useQueryClient()
  const drive = useQuery({ queryKey: ['drive-status'], queryFn: driveStatus, retry: false })
  const library = useQuery({ queryKey: ['checklist-library'], queryFn: loadOfficialChecklists })
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'ok' | 'alert'>('ok')
  const [busy, setBusy] = useState('')
  const [folderUrl, setFolderUrl] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [progress, setProgress] = useState<ReadProgress | null>(null)

  if (!canManage(profile)) return <Navigate to="/" replace />
  if (library.isLoading) return <p className="muted">Carregando checklists...</p>
  if (library.error || !library.data) {
    return <p className="alert">{library.error instanceof Error ? library.error.message : 'Não foi possível carregar os checklists.'}</p>
  }

  const data = library.data
  const admin = !!profile?.is_admin
  const connected = !!drive.data?.connected
  const source = data.sources[0]
  const url = folderUrl ?? source?.drive_folder_url ?? ''
  const visible = data.files.filter((file) => file.processing_status !== 'Ignorado')
  const approved = approvedTemplates(data)
  const pending = visible.filter((file) => ['Novo', 'Alterado', 'Erro'].includes(file.processing_status ?? '')).length
  const approvedItems = data.items.filter((item) => approved.some((template) => data.modules.some((module) => module.id === item.module_id && module.template_id === template.id))).length

  function notice(text: string, kind: 'ok' | 'alert' = 'ok') {
    setTone(kind)
    setMessage(text)
  }

  async function reconnect() {
    setBusy('conectar')
    notice('')
    try {
      const authorization = await connectDrive()
      const popup = window.open(authorization, 'setGoogleDriveAuth', 'width=680,height=780')
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
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Não foi possível conectar o Drive.', 'alert')
    } finally {
      setBusy('')
    }
  }

  async function sync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!connected) {
      notice('Conecte o Google Drive antes de continuar.', 'alert')
      return
    }
    if (!url.trim()) {
      notice('Informe o link da pasta oficial.', 'alert')
      return
    }
    setBusy('sync')
    notice('')
    try {
      const counts = await syncChecklistFolder(url.trim())
      await refresh()
      notice(`Sincronização concluída: ${counts.total || 0} documento(s), ${counts.new || 0} novo(s) e ${counts.changed || 0} alterado(s).`)
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Não foi possível sincronizar a pasta.', 'alert')
    } finally {
      setBusy('')
    }
  }

  async function resetAndSync() {
    const confirmed = window.confirm('Isso vai excluir os dados atuais dos checklists oficiais, desvincular as interpretações aprovadas e sincronizar tudo novamente. Deseja continuar?')
    if (!confirmed) return
    setBusy('reset')
    notice('')
    try {
      await resetOfficialChecklists()
      if (url.trim()) {
        if (!connected) throw new Error('Conecte o Google Drive antes de puxar a pasta novamente.')
        const counts = await syncChecklistFolder(url.trim(), true)
        notice(`Pasta sincronizada novamente: ${counts.total || 0} documento(s), ${counts.new || 0} novo(s) e ${counts.changed || 0} alterado(s).`)
      } else {
        notice('Dados dos checklists removidos.')
      }
      setFolderUrl(null)
      await refresh()
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Não foi possível limpar os checklists.', 'alert')
      await refresh()
    } finally {
      setBusy('')
    }
  }

  async function removeFile(file: ChecklistDriveFile) {
    const confirmed = window.confirm(`Excluir "${file.file_name || 'checklist'}" do sistema?\n\nO arquivo não será apagado do Google Drive. Ele ficará ignorado nas próximas sincronizações. Se estiver vinculado a processos, o vínculo ativo será removido.`)
    if (!confirmed) return
    setBusy(file.id)
    notice('')
    try {
      await excludeChecklistFile(file.id)
      await refresh()
      notice('Checklist excluído do sistema. O arquivo original permanece no Google Drive.')
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Não foi possível excluir o checklist.', 'alert')
    } finally {
      setBusy('')
    }
  }

  async function readFile(file: ChecklistDriveFile) {
    setBusy(file.id)
    notice('')
    setProgress({ percent: 4, title: 'Lendo checklist', detail: 'Preparando a leitura do documento oficial.' })
    try {
      const result = await readOfficialChecklist(file, setProgress)
      await refresh()
      if (result.unchanged) {
        notice('O arquivo teve alteração de metadados no Drive, mas o conteúdo do checklist não mudou. Nenhuma nova interpretação foi necessária.')
        return
      }
      setReview({ kind: 'draft', file, parsed: result.parsed, model: modelFromParsed(result.parsed, file) })
    } catch (error) {
      await refresh()
      notice(error instanceof Error ? error.message : 'Não foi possível ler o checklist.', 'alert')
    } finally {
      setProgress(null)
      setBusy('')
    }
  }

  async function refresh() {
    await client.invalidateQueries({ queryKey: ['checklist-library'] })
    await client.invalidateQueries({ queryKey: ['workspace'] })
  }

  return (
    <div className="cadastro checklists">
      <div className="heading">
        <div>
          <p className="eyebrow">Checklists</p>
          <h1>Checklists oficiais</h1>
        </div>
      </div>

      {admin ? (
        <div className="checklistHero">
          <section className="driveHero">
            <div className="driveMark" aria-hidden="true">
              <svg viewBox="0 0 64 64">
                <path fill="#0F9D58" d="M23 8h17l17 29-8.5 15H32L14.8 22z" />
                <path fill="#F4B400" d="M14.8 22 6 37l8.6 15h17.4l-8.7-15z" />
                <path fill="#4285F4" d="M57 37H23.3L14.6 52h33.9z" />
              </svg>
            </div>
            <p className="heroKicker">Fonte oficial</p>
            <h2>Vincular pasta do Google Drive</h2>
            <p>Selecione a pasta principal onde ficam os checklists oficiais. Se preferir, você também pode limpar tudo e puxar novamente.</p>
            <div className={`driveStatus${connected ? ' online' : ''}`}>
              <span />
              <div>
                <b>{drive.isLoading ? 'Verificando Google Drive' : connected ? 'Google Drive conectado' : 'Google Drive desconectado'}</b>
                <small>{connected ? drive.data?.email || 'Conta autorizada' : 'Conecte o Drive para vincular e sincronizar a pasta oficial.'}</small>
              </div>
              <button type="button" onClick={() => void reconnect()} disabled={busy === 'conectar'}>
                {connected ? 'Reconectar' : 'Conectar'}
              </button>
            </div>
            <form onSubmit={(event) => void sync(event)}>
              <input
                name="folder_url"
                type="url"
                required
                value={url}
                placeholder="Cole aqui o link da pasta principal do Google Drive"
                onChange={(event) => setFolderUrl(event.target.value)}
              />
              <button className="button" disabled={!connected || busy === 'sync' || busy === 'reset'}>
                {busy === 'sync' ? 'Sincronizando...' : source ? 'Sincronizar pasta' : 'Vincular e ler pasta'}
              </button>
            </form>
            {source ? (
              <div className="checklistActions">
                <button type="button" className="checkReset" onClick={() => void resetAndSync()} disabled={busy === 'reset' || busy === 'sync'}>
                  {busy === 'reset' ? 'Limpando...' : 'Excluir tudo e puxar de novo'}
                </button>
              </div>
            ) : null}
            {source ? (
              <div className="checklistMeta">
                <span>
                  <b>Fonte vinculada</b> · {source.folder_name || 'CHECKLIST'}
                </span>
                <span>
                  <b>Última sincronização</b> · {when(source.last_sync_at)}
                </span>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {message ? <p className={tone === 'ok' ? 'oknote' : 'alert'}>{message}</p> : null}

      <section className="checkCards">
        <article>
          <span>Checklists aprovados</span>
          <strong>{approved.length}</strong>
          <p>Versões validadas e disponíveis para vínculo aos processos.</p>
        </article>
        <article>
          <span>Novos / alterados</span>
          <strong>{pending}</strong>
          <p>Documentos que precisam ser lidos ou revisados.</p>
        </article>
        <article>
          <span>Itens interpretados</span>
          <strong>{approvedItems}</strong>
          <p>Requisitos com plano de verificação aprovado.</p>
        </article>
      </section>

      <section className="linkedPanel">
        <div className="linkedHead">
          <h2>Documentos encontrados no Drive</h2>
        </div>
        {data.sources.length === 0 ? <p className="muted">Nenhuma pasta de checklists vinculada.</p> : null}
        {data.sources.length > 0 && visible.length === 0 ? <p className="muted">Nenhum checklist ativo encontrado nesta pasta.</p> : null}
        <div className="docList">
          {visible.map((file) => {
            const template = templateForFile(data, file)
            const status = fileStatus(file.processing_status)
            const canRead = admin && ['Novo', 'Alterado', 'Erro'].includes(file.processing_status ?? '')
            return (
              <div className="docRow" key={file.id}>
                <span className="wordMark" aria-hidden="true">W</span>
                <div>
                  <b>{file.file_name || 'Documento'}</b>
                  <small>
                    {file.relative_path || 'CHECKLIST'} · modificado em {when(file.drive_modified_at)}
                  </small>
                  {template ? (
                    <small>
                      Versão aprovada {template.source_version || 1} · {template.instrument_type || 'aplicação não informada'}
                    </small>
                  ) : null}
                  {file.processing_status === 'Erro' && file.error_message ? <small>{file.error_message}</small> : null}
                </div>
                <strong className={`fileState ${status.className}`}>{status.label}</strong>
                <div className="sourceButtons">
                  {canRead ? (
                    <button type="button" className="go" onClick={() => void readFile(file)} disabled={busy === file.id}>
                      {file.processing_status === 'Alterado' ? 'Ler nova versão' : 'Ler e interpretar'}
                    </button>
                  ) : null}
                  {template ? (
                    <button type="button" onClick={() => setReview({ kind: 'approved', model: modelFromTemplate(data, template) })}>
                      Ver interpretação
                    </button>
                  ) : null}
                  {admin ? (
                    <button type="button" className="danger" onClick={() => void removeFile(file)} disabled={busy === file.id}>
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {approved.length ? (
        <section className="linkedPanel">
          <div className="linkedHead">
            <div>
              <h2>Versões aprovadas</h2>
              <p className="muted">Interpretações disponíveis para uso na análise dos processos.</p>
            </div>
          </div>
          {approved.map((template) => (
            <div className="versionCard" key={template.id}>
              <div className="docMain">
                <b>{template.name || 'Checklist'}</b>
                <small>
                  {template.source_file_name || 'Arquivo do Drive'} · {template.instrument_type || 'Instrumento'} · versão {template.source_version || 1}
                </small>
              </div>
              {data.modules
                .filter((module) => module.template_id === template.id)
                .map((module) => {
                  const count = data.items.filter((item) => item.module_id === module.id).length
                  const keys = (module.folder_keys ?? []).join(', ')
                  return (
                    <div className="moduleLine" key={module.id}>
                      <div>
                        <b>{cleanStageTitle(module.title) || 'Módulo'}</b>
                        <small>
                          {count} item(ns) · vínculo: {keys || 'não definido'}
                        </small>
                      </div>
                      <div className="sourceButtons">
                        <button type="button" onClick={() => setReview({ kind: 'approved', model: modelFromTemplate(data, template) })}>
                          Revisar interpretação
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          ))}
        </section>
      ) : null}

      {review ? (
        <InterpretationDialog
          review={review}
          admin={admin}
          busy={busy === 'salvar'}
          onClose={() => setReview(null)}
          onChange={setReview}
          onSave={async () => {
            setBusy('salvar')
            notice('')
            try {
              if (review.kind === 'draft') {
                const parsed = applyDraft(review.parsed, review.model)
                const total = await saveDriveChecklist(review.file, parsed)
                setReview(null)
                await refresh()
                notice(`Checklist aprovado: ${total} item(ns) interpretados e vinculáveis aos processos.`)
              } else {
                await saveApprovedInterpretation({
                  userId: session?.user.id ?? '',
                  modules: review.model.modules.map((module) => ({ id: module.id || '', keys: splitComma(module.keys) })),
                  items: review.model.modules.flatMap((module) =>
                    module.items.map((item) => ({
                      id: item.id || '',
                      interpretation: item.interpretation.trim(),
                      expected_evidence: splitLines(item.evidence),
                      analysis_focus: item.focus.trim(),
                      conform_when: item.conform.trim(),
                      nonconform_when: item.nonconform.trim(),
                      review_when: item.review.trim(),
                      search_terms: splitComma(item.terms),
                    })),
                  ),
                })
                setReview(null)
                await refresh()
                notice('Interpretação do checklist atualizada. As próximas análises usarão os ajustes salvos.')
              }
            } catch (error) {
              notice(error instanceof Error ? error.message : 'Não foi possível salvar a interpretação.', 'alert')
            } finally {
              setBusy('')
            }
          }}
        />
      ) : null}

      {progress ? (
        <div className="overlay">
          <div className="dialog progressDialog">
            <p className="eyebrow">Leitura do checklist</p>
            <h2>{progress.title}</h2>
            <p>{progress.detail}</p>
            <div className="progressTrack">
              <i style={{ width: `${progress.percent}%` }} />
            </div>
            <b>{progress.percent}%</b>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function InterpretationDialog({
  review,
  admin,
  busy,
  onClose,
  onChange,
  onSave,
}: {
  review: Review
  admin: boolean
  busy: boolean
  onClose: () => void
  onChange: (review: Review) => void
  onSave: () => Promise<void>
}) {
  const model = review.model
  const locked = review.kind === 'approved' && !admin
  const total = model.modules.reduce((sum, module) => sum + module.items.length, 0)

  function update(next: EditModel) {
    onChange(review.kind === 'draft' ? { ...review, model: next } : { ...review, model: next })
  }

  return (
    <div className="overlay">
      <form
        className="dialog interpretDialog"
        onSubmit={(event) => {
          event.preventDefault()
          void onSave()
        }}
      >
        <div className="dialogHead">
          <div>
            <p className="eyebrow">{review.kind === 'draft' ? 'Conferência antes de salvar' : 'Checklist aprovado'}</p>
            <h2>{review.kind === 'draft' ? 'Interpretação do checklist' : model.name || 'Checklist'}</h2>
            <p className="muted">
              {review.kind === 'draft'
                ? 'Confira o que o sistema entendeu. Você pode ajustar a aplicação, os vínculos e a interpretação de qualquer item antes de aprovar.'
                : 'Você pode aperfeiçoar a interpretação aprovada. O texto original do checklist permanece preservado.'}
            </p>
          </div>
          <button type="button" className="dialogClose" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        {review.kind === 'draft' ? (
          <div className="grid">
            <label>
              Nome do checklist
              <input value={model.name} onChange={(event) => update({ ...model, name: event.target.value })} required />
            </label>
            <label>
              Tipo de instrumento
              <input value={model.instrument} onChange={(event) => update({ ...model, instrument: event.target.value })} required />
            </label>
            <div className="originalBox">
              <span>Arquivo oficial</span>
              <b>{model.fileName}</b>
              <small>{total} item(ns) identificados</small>
            </div>
          </div>
        ) : null}
        <div className="interpretModules">
          {model.modules.map((module, moduleIndex) => (
            <section key={module.key}>
              <div className="moduleHead">
                <div>
                  <span>Etapa / módulo {moduleIndex + 1}</span>
                  <h3>{cleanStageTitle(module.title) || module.title}</h3>
                  <small>{module.items.length} item(ns)</small>
                </div>
                <label>
                  Pastas ou etapas que usam este módulo
                  <input
                    value={module.keys}
                    disabled={locked}
                    placeholder="CELEBRAÇÃO, ADITIVO, PAGAMENTO"
                    onChange={(event) => {
                      const modules = model.modules.map((item, index) => (index === moduleIndex ? { ...item, keys: event.target.value } : item))
                      update({ ...model, modules })
                    }}
                  />
                </label>
              </div>
              {module.items.map((item, itemIndex) => (
                <details key={item.key} open={itemIndex === 0}>
                  <summary>
                    <b>{item.code}</b>
                    <span>{item.verification.slice(0, 180)}</span>
                  </summary>
                  <div className="interpretBody">
                    <div className="originalBox">
                      <span>Requisito original</span>
                      <p>{item.verification}</p>
                      {item.basis ? (
                        <small>
                          <b>Fundamento:</b> {item.basis}
                        </small>
                      ) : null}
                    </div>
                    <label>
                      Interpretação do requisito
                      <textarea rows={3} value={item.interpretation} disabled={locked} onChange={(event) => update(editItem(model, moduleIndex, itemIndex, { interpretation: event.target.value }))} />
                    </label>
                    <div className="interpretGrid">
                      <label>
                        Evidências possíveis
                        <textarea rows={4} value={item.evidence} disabled={locked} onChange={(event) => update(editItem(model, moduleIndex, itemIndex, { evidence: event.target.value }))} />
                      </label>
                      <label>
                        Foco da análise
                        <textarea rows={4} value={item.focus} disabled={locked} onChange={(event) => update(editItem(model, moduleIndex, itemIndex, { focus: event.target.value }))} />
                      </label>
                    </div>
                    <div className="interpretGrid three">
                      <label>
                        Quando considerar Conforme
                        <textarea rows={3} value={item.conform} disabled={locked} onChange={(event) => update(editItem(model, moduleIndex, itemIndex, { conform: event.target.value }))} />
                      </label>
                      <label>
                        Quando considerar Não conforme
                        <textarea rows={3} value={item.nonconform} disabled={locked} onChange={(event) => update(editItem(model, moduleIndex, itemIndex, { nonconform: event.target.value }))} />
                      </label>
                      <label>
                        Quando exigir revisão humana
                        <textarea rows={3} value={item.review} disabled={locked} onChange={(event) => update(editItem(model, moduleIndex, itemIndex, { review: event.target.value }))} />
                      </label>
                    </div>
                    <label>
                      Termos para busca
                      <input value={item.terms} disabled={locked} onChange={(event) => update(editItem(model, moduleIndex, itemIndex, { terms: event.target.value }))} />
                    </label>
                  </div>
                </details>
              ))}
            </section>
          ))}
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>
            {locked ? 'Fechar' : 'Cancelar'}
          </button>
          {locked ? null : (
            <button className="button" disabled={busy}>
              {busy ? 'Salvando...' : review.kind === 'draft' ? 'Aprovar e salvar checklist' : 'Salvar ajustes'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function editItem(model: EditModel, moduleIndex: number, itemIndex: number, patch: Partial<EditItem>): EditModel {
  return {
    ...model,
    modules: model.modules.map((module, index) =>
      index === moduleIndex
        ? { ...module, items: module.items.map((item, position) => (position === itemIndex ? { ...item, ...patch } : item)) }
        : module,
    ),
  }
}

function modelFromParsed(parsed: ParsedChecklist, file: ChecklistDriveFile): EditModel {
  return {
    name: parsed.name,
    instrument: parsed.instrument_type,
    fileName: file.file_name || parsed.source_file_name,
    modules: parsed.modules.map((module, moduleIndex) => ({
      key: `${moduleIndex}`,
      title: module.title,
      keys: module.folder_keys.join(', '),
      items: module.items.map((item, itemIndex) => ({
        key: `${moduleIndex}:${itemIndex}`,
        code: item.item_code,
        verification: item.verification,
        basis: item.basis,
        interpretation: item.interpretation,
        evidence: item.expected_evidence.join('\n'),
        focus: item.analysis_focus,
        conform: item.conform_when,
        nonconform: item.nonconform_when,
        review: item.review_when,
        terms: item.search_terms.join(', '),
      })),
    })),
  }
}

function modelFromTemplate(library: OfficialLibrary, template: OfficialTemplate): EditModel {
  const modules = library.modules.filter((module) => module.template_id === template.id)
  return {
    name: template.name || 'Checklist',
    instrument: template.instrument_type || '',
    fileName: template.source_file_name || '',
    modules: modules.map((module) => ({
      key: module.id,
      id: module.id,
      title: module.title || 'Módulo',
      keys: (module.folder_keys ?? []).join(', '),
      items: library.items
        .filter((item) => item.module_id === module.id)
        .map((item) => itemFields(item)),
    })),
  }
}

function itemFields(item: OfficialItem): EditItem {
  return {
    key: item.id,
    id: item.id,
    code: item.item_code || 'Item',
    verification: item.verification || (item as OfficialItem & { criterion?: string | null }).criterion || '',
    basis: item.basis || '',
    interpretation: item.interpretation || '',
    evidence: listOf(item.expected_evidence).join('\n'),
    focus: item.analysis_focus || '',
    conform: item.conform_when || '',
    nonconform: item.nonconform_when || '',
    review: item.review_when || '',
    terms: listOf(item.search_terms).join(', '),
  }
}

function applyDraft(parsed: ParsedChecklist, model: EditModel): ParsedChecklist {
  return {
    ...parsed,
    name: model.name.trim(),
    instrument_type: model.instrument.trim(),
    instrument_key: norm(model.instrument),
    modules: parsed.modules.map((module, moduleIndex) => {
      const edited = model.modules[moduleIndex]
      return {
        ...module,
        folder_keys: splitComma(edited?.keys || ''),
        items: module.items.map((item, itemIndex) => {
          const row = edited?.items[itemIndex]
          return {
            ...item,
            interpretation: row?.interpretation.trim() || '',
            expected_evidence: splitLines(row?.evidence || ''),
            analysis_focus: row?.focus.trim() || '',
            conform_when: row?.conform.trim() || '',
            nonconform_when: row?.nonconform.trim() || '',
            review_when: row?.review.trim() || '',
            search_terms: splitComma(row?.terms || ''),
          }
        }),
      }
    }),
  }
}

function approvedTemplates(library: OfficialLibrary) {
  return library.templates.filter((template) => template.source_drive_file_id && template.active !== false && template.review_status === 'Aprovado')
}

function templateForFile(library: OfficialLibrary, file: ChecklistDriveFile) {
  return (
    library.templates.find((template) => template.id === file.template_id) ||
    library.templates.find((template) => template.source_drive_file_id === file.drive_file_id && template.active !== false) ||
    null
  )
}

function fileStatus(status: string | null) {
  if (status === 'Aprovado') return { label: 'Aprovado', className: 'ok' }
  if (status === 'Alterado') return { label: 'Nova versão detectada', className: 'warn' }
  if (status === 'Novo') return { label: 'Novo — aguardando leitura', className: 'wait' }
  if (status === 'Erro') return { label: 'Erro', className: 'err' }
  return { label: status || 'Aguardando', className: 'wait' }
}

function when(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

function splitComma(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function splitLines(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}
