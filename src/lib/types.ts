export type Profile = {
  user_id: string
  area: string
  is_admin: boolean
  is_manager: boolean
  active: boolean
  full_name: string | null
  email: string | null
  approved_at: string | null
  approved_by: string | null
}

export type AccessRole = 'user' | 'manager' | 'admin'

export type ProcessRow = {
  id: string
  nup: string | null
  object: string | null
  area: string
  project_name: string | null
  kind: string | null
  instrument_title: string | null
  drive_folder_url: string | null
  drive_folder_id: string | null
  status: string | null
  created_by: string | null
  process_stage: string | null
  responsible_name: string | null
  responsible_email: string | null
  checklist_template_id: string | null
  checklist_module_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type ChecklistItem = {
  id: string
  process_id: string
  ordinal: number | null
  code: string | null
  section: string | null
  criterion: string | null
  responsible: string | null
  basis: string | null
  suite_page: string | null
  finding: string | null
  analysis: string | null
  recommendation: string | null
  notes: string | null
  status: string | null
  resolution_area: string | null
  technician_name: string | null
  deadline_start: string | null
  deadline_end: string | null
  procedure_adopted: string | null
  pending_observation: string | null
  validated: boolean | null
  validated_at: string | null
  validated_by: string | null
  extra_drive_url: string | null
  updated_at: string | null
}

export type TemplateRow = {
  id: string
  name: string | null
  instrument_type: string | null
  source_file_name: string | null
  created_at: string | null
}

export type ModuleRow = {
  id: string
  template_id: string
  title: string | null
  code: string | null
}

export type Assignment = {
  id: string
  checklist_item_id: string
  process_id: string
  assigned_to: string
  assigned_by: string
  status: string
  note: string | null
  procedure_adopted: string | null
  deadline_start: string | null
  deadline_end: string | null
  assigned_at: string | null
  started_at: string | null
  completed_at: string | null
  completion_note: string | null
  updated_at: string | null
}

export type AssignableUser = {
  user_id: string
  full_name: string | null
  email: string | null
  area: string | null
}

export type Workspace = {
  processes: ProcessRow[]
  items: ChecklistItem[]
  templates: TemplateRow[]
  modules: ModuleRow[]
  assignments: Assignment[]
}

export type ItemDraft = {
  status: string
  suite_page: string
  finding: string
  resolution_area: string
  technician_name: string
  deadline_start: string
  deadline_end: string
  procedure_adopted: string
  pending_observation: string
  validated: boolean
  extra_drive_url: string
  expected_updated_at: string | null
}
