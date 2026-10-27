import type { PostgrestError } from '@supabase/supabase-js'
import { parseChecklistDocx, type ParsedChecklist } from './checklistDocx'
import { supabase, supabasePublishableKey, supabaseUrl } from './supabase'
import type {
  AccessRole,
  AssignableUser,
  Assignment,
  ChecklistItem,
  ItemDraft,
  ModuleRow,
  ProcessRow,
  Profile,
  TemplateRow,
  Workspace,
} from './types'

function fail(error: PostgrestError | null) {
  if (error) throw new Error(error.message)
}

async function pages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
) {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await load(from, from + 999)
    fail(error)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

const ITEM_COLUMNS =
  'id,process_id,ordinal,code,section,criterion,responsible,basis,suite_page,finding,analysis,recommendation,notes,status,resolution_area,technician_name,deadline_start,deadline_end,procedure_adopted,pending_observation,validated,validated_at,validated_by,extra_drive_url,updated_at'

const PROFILE_COLUMNS = 'user_id,area,is_admin,is_manager,active,full_name,email,approved_at,approved_by'
const PROFILE_COLUMNS_LEGACY = 'user_id,area,is_admin,active,full_name,email,approved_at,approved_by'

function asProfile(row: Omit<Profile, 'is_manager'> & { is_manager?: boolean | null }): Profile {
  return { ...row, is_manager: !!row.is_manager }
}

export async function loadProfile(userId: string) {
  const first = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle()
  if (!first.error) return first.data ? asProfile(first.data as Profile) : null
  if (!/is_manager/i.test(first.error.message)) fail(first.error)
  const second = await supabase.from('profiles').select(PROFILE_COLUMNS_LEGACY).eq('user_id', userId).maybeSingle()
  fail(second.error)
  if (!second.data) return null
  const legacy = second.data as Omit<Profile, 'is_manager'>
  return asProfile({ ...legacy, is_manager: !legacy.is_admin })
}

export async function loadProfiles() {
  const first = await supabase.from('profiles').select(PROFILE_COLUMNS).order('full_name', { ascending: true })
  if (!first.error) return ((first.data ?? []) as Profile[]).map(asProfile)
  if (!/is_manager/i.test(first.error.message)) fail(first.error)
  const second = await supabase.from('profiles').select(PROFILE_COLUMNS_LEGACY).order('full_name', { ascending: true })
  fail(second.error)
  return ((second.data ?? []) as Omit<Profile, 'is_manager'>[]).map((row) =>
    asProfile({ ...row, is_manager: !row.is_admin }),
  )
}

export async function loadWorkspace(): Promise<Workspace> {
  const [processes, items, templates, modules, assignments] = await Promise.all([
    pages<ProcessRow>((from, to) =>
      supabase.from('processes').select('*').order('created_at', { ascending: false }).range(from, to),
    ),
    pages<ChecklistItem>((from, to) =>
      supabase.from('checklist_items').select(ITEM_COLUMNS).order('ordinal', { ascending: true }).range(from, to),
    ),
    pages<TemplateRow>((from, to) =>
      supabase.from('checklist_templates').select('id,name,instrument_type,source_file_name,created_at').range(from, to),
    ),
    pages<ModuleRow>((from, to) =>
      supabase.from('checklist_modules').select('id,template_id,title,code').range(from, to),
    ),
    pages<Assignment>((from, to) =>
      supabase.from('pending_assignments').select('*').order('assigned_at', { ascending: false }).range(from, to),
    ),
  ])
  return { processes, items, templates, modules, assignments }
}

export async function approveAccess(userId: string, area: string, role: AccessRole) {
  const payload = {
    p_user_id: userId,
    p_area: area,
    p_is_admin: role === 'admin',
    p_is_manager: role === 'manager',
  }
  const first = await supabase.rpc('approve_access_request', payload)
  if (!first.error) return
  if (!missingFunction(first.error)) throw new Error(first.error.message)
  const second = await supabase.rpc('approve_access_request', {
    p_user_id: userId,
    p_area: area,
    p_is_admin: role === 'admin',
  })
  fail(second.error)
  const updated = await supabase
    .from('profiles')
    .update({ is_admin: role === 'admin', is_manager: role === 'manager' })
    .eq('user_id', userId)
  if (updated.error && role === 'manager') throw new Error(updated.error.message)
}

export async function rejectAccess(userId: string) {
  const first = await supabase.rpc('reject_access_request', { p_user_id: userId })
  if (!first.error) return
  if (!missingFunction(first.error)) throw new Error(first.error.message)
  const updated = await supabase.from('profiles').update({ active: false }).eq('user_id', userId)
  fail(updated.error)
}

export async function updateUserProfile(input: {
  userId: string
  fullName: string
  area: string
  role: AccessRole
  active: boolean
}) {
  const payload = {
    p_user_id: input.userId,
    p_full_name: input.fullName,
    p_area: input.area,
    p_is_admin: input.role === 'admin',
    p_is_manager: input.role === 'manager',
    p_active: input.active,
  }
  const first = await supabase.rpc('admin_update_user_profile', payload)
  if (!first.error) return
  if (!missingFunction(first.error)) throw new Error(first.error.message)
  const updated = await supabase
    .from('profiles')
    .update({
      full_name: input.fullName,
      area: input.area,
      is_admin: input.role === 'admin',
      is_manager: input.role === 'manager',
      active: input.active,
    })
    .eq('user_id', input.userId)
  fail(updated.error)
}

export async function listAssignable(processId: string) {
  const { data, error } = await supabase.rpc('list_assignable_users', { p_process_id: processId })
  fail(error)
  return (data ?? []) as AssignableUser[]
}

function missingFunction(error: PostgrestError) {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message)
}

export async function saveItem(itemId: string, draft: ItemDraft, userId: string) {
  const { error } = await supabase.rpc('update_checklist_item', {
    p_id: itemId,
    p_status: draft.status,
    p_suite_page: draft.suite_page || null,
    p_finding: draft.finding || null,
    p_resolution_area: draft.resolution_area || null,
    p_technician_name: draft.technician_name || null,
    p_deadline_start: draft.deadline_start || null,
    p_deadline_end: draft.deadline_end || null,
    p_procedure_adopted: draft.procedure_adopted || null,
    p_pending_observation: draft.pending_observation || null,
    p_validated: draft.validated,
    p_extra_drive_url: draft.extra_drive_url || null,
    p_expected_updated_at: draft.expected_updated_at,
  })
  if (!error) return
  if (!missingFunction(error)) throw new Error(error.message)

  let query = supabase
    .from('checklist_items')
    .update({
      status: draft.status,
      suite_page: draft.suite_page || null,
      finding: draft.finding || null,
      resolution_area: draft.resolution_area || null,
      technician_name: draft.technician_name || null,
      deadline_start: draft.deadline_start || null,
      deadline_end: draft.deadline_end || null,
      procedure_adopted: draft.procedure_adopted || null,
      pending_observation: draft.pending_observation || null,
      validated: draft.validated,
      validated_at: draft.validated ? new Date().toISOString() : null,
      validated_by: draft.validated ? userId : null,
      extra_drive_url: draft.extra_drive_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
  if (draft.expected_updated_at) query = query.eq('updated_at', draft.expected_updated_at)
  const updated = await query.select('id')
  fail(updated.error)
  if (!updated.data?.length) {
    throw new Error('Este item foi alterado por outra pessoa. Atualize a tela e tente de novo.')
  }
}

export type DriveSource = {
  id: string
  drive_folder_url: string | null
  drive_folder_id: string | null
  area: string | null
  read_status: string | null
  detected_instrument_title: string | null
  detected_project: string | null
  detected_kind: string | null
}

export type DriveRead = {
  ok?: boolean
  error?: string
  detected?: { area?: string; project?: string; kind?: string; instrument_title?: string }
  root?: { name?: string }
}

export async function driveStatus() {
  const { data, error } = await supabase.functions.invoke('google-drive-status', { body: {} })
  if (error) throw new Error(error.message)
  const row = data as { connected?: boolean; email?: string | null }
  return { connected: !!row?.connected, email: row?.email ?? null }
}

export async function connectDrive() {
  const { data, error } = await supabase.functions.invoke('google-drive-connect', { body: {} })
  if (error) throw new Error(error.message)
  const url = (data as { authorization_url?: string })?.authorization_url
  if (!url) throw new Error('O servidor não devolveu a autorização do Google Drive.')
  return url
}

export async function readDriveFolder(url: string) {
  const { data, error } = await supabase.functions.invoke('google-drive-read-folder', { body: { folder_url: url } })
  if (error) throw new Error(error.message)
  const row = data as DriveRead
  if (!row?.ok) throw new Error(row?.error || 'Não foi possível ler a pasta.')
  return row
}

export async function loadDriveSources() {
  const { data, error } = await supabase.from('drive_sources').select('id,drive_folder_url,drive_folder_id,area,read_status,detected_instrument_title,detected_project,detected_kind').order('updated_at', { ascending: false })
  fail(error)
  return (data ?? []) as DriveSource[]
}

export async function deleteDriveSource(id: string) {
  const { error } = await supabase.rpc('delete_drive_source_record', { p_source_id: id })
  fail(error)
}

export type ProcessInput = {
  id?: string
  area: string
  project_name: string
  kind: string
  instrument_title: string
  nup: string
  object: string
  process_stage: string
  drive_folder_url: string
  drive_folder_id: string | null
  responsible_name: string
  responsible_email: string
  drive_source_id?: string | null
}

export async function deleteProcess(id: string) {
  const { error } = await supabase.from('processes').delete().eq('id', id)
  fail(error)
}

export async function saveProcess(input: ProcessInput, userId: string) {
  const payload = {
    area: input.area,
    project_name: input.project_name,
    kind: input.kind,
    instrument_title: input.instrument_title,
    nup: input.nup || null,
    object: input.object,
    process_stage: input.process_stage,
    drive_folder_url: input.drive_folder_url || null,
    drive_folder_id: input.drive_folder_id,
    responsible_name: input.responsible_name,
    responsible_email: input.responsible_email,
    ...(input.drive_source_id ? { drive_source_id: input.drive_source_id } : {}),
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { error } = await supabase.from('processes').update(payload).eq('id', input.id)
    fail(error)
    return
  }
  const { error } = await supabase.from('processes').insert({
    ...payload,
    status: 'Cadastrado',
    created_by: userId,
  })
  fail(error)
}

export async function saveAssignment(input: {
  id?: string
  checklistItemId: string
  processId: string
  assignedTo: string
  assignedBy: string
  note: string
  procedure: string
  deadlineStart: string
  deadlineEnd: string
  keepStatus?: string
}) {
  const payload = {
    checklist_item_id: input.checklistItemId,
    process_id: input.processId,
    assigned_to: input.assignedTo,
    assigned_by: input.assignedBy,
    status: input.keepStatus ?? 'Nova',
    note: input.note,
    procedure_adopted: input.procedure || null,
    deadline_start: input.deadlineStart || null,
    deadline_end: input.deadlineEnd || null,
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { error } = await supabase.from('pending_assignments').update(payload).eq('id', input.id)
    fail(error)
    return
  }
  const { error } = await supabase.from('pending_assignments').insert(payload)
  fail(error)
}

export async function markAssignment(id: string, status: 'Em andamento' | 'Cancelada') {
  const patch =
    status === 'Em andamento'
      ? { status, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status, updated_at: new Date().toISOString() }
  const { error } = await supabase.from('pending_assignments').update(patch).eq('id', id)
  fail(error)
}

export async function completeAssignment(id: string) {
  const { error } = await supabase.rpc('complete_pending_assignment', { p_assignment_id: id })
  fail(error)
}

export type ChecklistDriveSource = {
  id: string
  drive_folder_url: string | null
  folder_name: string | null
  last_sync_at: string | null
}

export type ChecklistDriveFile = {
  id: string
  file_name: string | null
  relative_path: string | null
  drive_file_id: string | null
  drive_modified_at: string | null
  mime_type: string | null
  processing_status: string | null
  template_id: string | null
  last_hash: string | null
  error_message: string | null
}

export type OfficialTemplate = TemplateRow & {
  source_drive_file_id: string | null
  source_version: number | null
  review_status: string | null
  active: boolean | null
  source_hash: string | null
}

export type OfficialModule = ModuleRow & {
  folder_keys: string[] | null
  ordinal: number | null
}

export type OfficialItem = {
  id: string
  module_id: string
  item_code: string | null
  verification: string | null
  basis: string | null
  responsible: string | null
  interpretation: string | null
  expected_evidence: string[] | string | null
  analysis_focus: string | null
  conform_when: string | null
  nonconform_when: string | null
  review_when: string | null
  search_terms: string[] | string | null
  ordinal: number | null
}

export type OfficialLibrary = {
  sources: ChecklistDriveSource[]
  files: ChecklistDriveFile[]
  templates: OfficialTemplate[]
  modules: OfficialModule[]
  items: OfficialItem[]
}

export type ReadProgress = { percent: number; title: string; detail: string }

async function invoke<T>(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = error.message
    try {
      const payload = await (error as { context?: Response }).context?.json()
      if (payload && typeof payload === 'object' && 'error' in payload && payload.error) message = String(payload.error)
    } catch {
      message = error.message
    }
    throw new Error(message)
  }
  return data as T
}

export async function loadOfficialChecklists(): Promise<OfficialLibrary> {
  const [sources, files, templates, modules, items] = await Promise.all([
    pages<ChecklistDriveSource>((from, to) =>
      supabase.from('checklist_drive_sources').select('*').order('created_at', { ascending: false }).range(from, to),
    ),
    pages<ChecklistDriveFile>((from, to) =>
      supabase.from('checklist_drive_files').select('*').order('file_name', { ascending: true }).range(from, to),
    ),
    pages<OfficialTemplate>((from, to) =>
      supabase.from('checklist_templates').select('*').order('created_at', { ascending: false }).range(from, to),
    ),
    pages<OfficialModule>((from, to) =>
      supabase.from('checklist_modules').select('*').order('ordinal', { ascending: true }).range(from, to),
    ),
    pages<OfficialItem>((from, to) =>
      supabase.from('checklist_template_items').select('*').order('ordinal', { ascending: true }).range(from, to),
    ),
  ])
  return { sources, files, templates, modules, items }
}

export async function syncChecklistFolder(url: string, resetIgnored = false) {
  const data = await invoke<{ ok?: boolean; error?: string; counts?: { total?: number; new?: number; changed?: number } }>(
    'checklist-drive-list',
    { folder_url: url, reset_ignored: resetIgnored },
  )
  if (!data?.ok) throw new Error(data?.error || 'Não foi possível ler a pasta de checklists.')
  return data.counts ?? {}
}

export async function excludeChecklistFile(id: string) {
  const { error } = await supabase.rpc('exclude_drive_checklist_file', { p_file_record_id: id })
  fail(error)
}

async function wipeTable(table: string) {
  const { error } = await supabase.from(table).delete().not('id', 'is', null)
  fail(error)
}

export async function resetOfficialChecklists() {
  await wipeTable('checklist_report_items')
  await wipeTable('checklist_reports')
  await wipeTable('process_checklists')
  await wipeTable('checklist_template_items')
  await wipeTable('checklist_modules')
  await wipeTable('checklist_templates')
  await wipeTable('checklist_drive_files')
  await wipeTable('checklist_drive_sources')
  const cleared = await supabase
    .from('processes')
    .update({ checklist_template_id: null, checklist_module_id: null })
    .not('id', 'is', null)
  fail(cleared.error)
}

export async function downloadChecklistFile(file: ChecklistDriveFile) {
  if (!file.drive_file_id) throw new Error('O documento não tem identificador no Google Drive.')
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) throw new Error('Sessão expirada. Entre novamente.')
  const exportParam = file.mime_type === 'application/vnd.google-apps.document' ? '&export_as=docx' : ''
  const response = await fetch(
    `${supabaseUrl}/functions/v1/google-drive-file-proxy?file_id=${encodeURIComponent(file.drive_file_id)}${exportParam}`,
    { headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublishableKey } },
  )
  if (!response.ok) {
    let message = 'Não foi possível baixar o checklist.'
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      message = 'Não foi possível baixar o checklist.'
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  const original = file.file_name || 'checklist.docx'
  const name = /\.docx$/i.test(original) ? original : `${original}.docx`
  return new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

export async function readOfficialChecklist(file: ChecklistDriveFile, onProgress: (progress: ReadProgress) => void) {
  try {
    onProgress({ percent: 8, title: 'Lendo checklist', detail: 'Baixando o documento oficial do Google Drive.' })
    const downloaded = await downloadChecklistFile(file)
    onProgress({ percent: 18, title: 'Estruturando documento', detail: 'Identificando módulos, tabelas e itens de verificação.' })
    const parsed = await parseChecklistDocx(downloaded)
    parsed.source_file_name = file.file_name || parsed.source_file_name
    if (file.last_hash && parsed.hash === file.last_hash && file.template_id) {
      const updated = await supabase
        .from('checklist_drive_files')
        .update({ processing_status: 'Aprovado', error_message: '', updated_at: new Date().toISOString() })
        .eq('id', file.id)
      fail(updated.error)
      return { unchanged: true as const, parsed }
    }
    const flat = parsed.modules.flatMap((module, moduleIndex) =>
      module.items.map((item, itemIndex) => ({
        id: `${moduleIndex}:${itemIndex}`,
        code: item.item_code,
        criterion: item.verification,
        responsible: item.responsible,
        basis: item.basis,
        module_title: module.title,
        section: `${item.section_code} ${item.section_title}`.trim(),
      })),
    )
    const interpreted = new Map<string, Record<string, unknown>>()
    for (let start = 0; start < flat.length; start += 18) {
      const chunk = flat.slice(start, start + 18)
      const percent = 35 + Math.round(((start + chunk.length) / Math.max(flat.length, 1)) * 48)
      onProgress({
        percent,
        title: 'Interpretando requisitos',
        detail: `Estruturando critérios de verificação — ${Math.min(start + chunk.length, flat.length)} de ${flat.length} itens.`,
      })
      const data = await invoke<{ configured?: boolean; error?: string; items?: Array<Record<string, unknown> & { id?: string }> }>(
        'checklist-interpret',
        {
          context: {
            checklist_name: parsed.name,
            instrument_type: parsed.instrument_type,
            source_file: file.file_name,
            total_items: flat.length,
          },
          items: chunk,
        },
      )
      if (!data?.configured) throw new Error(data?.error || 'O serviço de inteligência artificial não está configurado.')
      if (data.error) throw new Error(data.error)
      for (const item of data.items ?? []) interpreted.set(String(item.id), item)
    }
    const missing = flat.filter((item) => !interpreted.has(item.id))
    if (missing.length) throw new Error(`A interpretação retornou incompleta (${missing.length} item(ns) sem resposta). Tente novamente.`)
    parsed.modules.forEach((module, moduleIndex) => {
      module.items.forEach((item, itemIndex) => {
        const interpretedItem = interpreted.get(`${moduleIndex}:${itemIndex}`) ?? {}
        item.interpretation = textOf(interpretedItem.interpretation)
        item.expected_evidence = listOf(interpretedItem.expected_evidence)
        item.conform_when = textOf(interpretedItem.conform_when)
        item.nonconform_when = textOf(interpretedItem.nonconform_when)
        item.review_when = textOf(interpretedItem.review_when)
        item.search_terms = listOf(interpretedItem.search_terms)
        item.analysis_focus = textOf(interpretedItem.analysis_focus)
      })
    })
    return { unchanged: false as const, parsed }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível ler o checklist.'
    await supabase
      .from('checklist_drive_files')
      .update({ processing_status: 'Erro', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', file.id)
    throw error instanceof Error ? error : new Error(message)
  }
}

export async function saveDriveChecklist(file: ChecklistDriveFile, parsed: ParsedChecklist) {
  const total = parsed.modules.reduce((sum, module) => sum + module.items.length, 0)
  if (!parsed.name.trim() || !parsed.instrument_type.trim()) throw new Error('Informe o nome e o tipo de instrumento do checklist.')
  if (parsed.modules.some((module) => !module.folder_keys.length)) throw new Error('Informe ao menos uma chave de pasta para cada módulo.')
  const { error } = await supabase.rpc('register_drive_checklist_template', {
    p_file_record_id: file.id,
    p_name: parsed.name.trim(),
    p_instrument_type: parsed.instrument_type.trim(),
    p_instrument_key: parsed.instrument_key,
    p_source_file_name: file.file_name || parsed.source_file_name,
    p_source_hash: parsed.hash,
    p_source_context: {
      ...parsed.context,
      parser_version: 'drive-inteligente-v1',
      drive_file_id: file.drive_file_id,
      drive_modified_at: file.drive_modified_at,
      interpreted_at: new Date().toISOString(),
    },
    p_application_context: {
      instrument_type: parsed.instrument_type.trim(),
      linkage: 'tipo de instrumento + etapa/pasta',
      source: 'Google Drive',
    },
    p_modules: parsed.modules,
  })
  fail(error)
  return total
}

export async function saveApprovedInterpretation(input: {
  userId: string
  modules: { id: string; keys: string[] }[]
  items: {
    id: string
    interpretation: string
    expected_evidence: string[]
    analysis_focus: string
    conform_when: string
    nonconform_when: string
    review_when: string
    search_terms: string[]
  }[]
}) {
  for (const module of input.modules) {
    const updated = await supabase.from('checklist_modules').update({ folder_keys: module.keys }).eq('id', module.id)
    fail(updated.error)
  }
  for (const item of input.items) {
    const payload = {
      interpretation: item.interpretation,
      expected_evidence: item.expected_evidence,
      analysis_focus: item.analysis_focus,
      conform_when: item.conform_when,
      nonconform_when: item.nonconform_when,
      review_when: item.review_when,
      search_terms: item.search_terms,
      interpretation_updated_at: new Date().toISOString(),
      interpretation_updated_by: input.userId,
    }
    const updated = await supabase.from('checklist_template_items').update(payload).eq('id', item.id)
    if (!updated.error) continue
    if (!/interpretation_updated/i.test(updated.error.message)) fail(updated.error)
    const retry = await supabase
      .from('checklist_template_items')
      .update({
        interpretation: item.interpretation,
        expected_evidence: item.expected_evidence,
        analysis_focus: item.analysis_focus,
        conform_when: item.conform_when,
        nonconform_when: item.nonconform_when,
        review_when: item.review_when,
        search_terms: item.search_terms,
      })
      .eq('id', item.id)
    fail(retry.error)
  }
}

function textOf(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function listOf(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
  return []
}
