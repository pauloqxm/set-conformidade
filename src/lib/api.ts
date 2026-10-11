import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
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

export async function loadProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,area,is_admin,active,full_name,email,approved_at,approved_by')
    .eq('user_id', userId)
    .maybeSingle()
  fail(error)
  return (data as Profile | null) ?? null
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

export async function loadInactiveProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,area,is_admin,active,full_name,email,approved_at,approved_by')
    .eq('active', false)
    .order('email', { ascending: true })
  fail(error)
  return (data ?? []) as Profile[]
}

export async function approveAccess(userId: string, area: string, isAdmin: boolean) {
  const { error } = await supabase.rpc('approve_access_request', {
    p_user_id: userId,
    p_area: area,
    p_is_admin: isAdmin,
  })
  fail(error)
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
