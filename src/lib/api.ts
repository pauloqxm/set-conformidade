import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
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
