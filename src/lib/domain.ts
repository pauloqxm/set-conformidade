export const AREAS = [
  { id: 'COEMP', label: 'Coordenadoria de Empreendedorismo', color: '#17854a' },
  { id: 'COESA', label: 'Coordenadoria de Economia Solidária', color: '#1f8a79' },
  { id: 'COTRA', label: 'Coordenadoria do Trabalho e Renda', color: '#2f6f4e' },
  { id: 'COAFI', label: 'Coordenadoria Administrativo-Financeira', color: '#3d6b8a' },
  { id: 'ASCOI', label: 'Assessoria de Controle Interno', color: '#8a5b0b' },
  { id: 'CODIP', label: 'Coordenadoria de Desenvolvimento Institucional e Planejamento', color: '#1d6b45' },
] as const

export const ITEM_STATUSES = [
  'Conforme',
  'Não conforme',
  'Não se aplica',
  'Pendente documental',
  'Revisão técnica necessária',
  'Em resolução',
] as const

const CLOSED = new Set(['Conforme', 'Não se aplica'])

export function areaLabel(id: string | null | undefined) {
  return AREAS.find((area) => area.id === id)?.label ?? id ?? 'Sem coordenação'
}

export function projectName(name: string | null | undefined) {
  const clean = (name ?? '').trim()
  return clean || 'Sem projeto'
}

export function isClosed(status: string | null | undefined, validated: boolean | null | undefined) {
  return CLOSED.has(status ?? '') && !!validated
}

export function needsAttention(status: string | null | undefined, validated: boolean | null | undefined) {
  return !isClosed(status, validated)
}

export function pendingKind(status: string | null | undefined, validated: boolean | null | undefined) {
  if (isClosed(status, validated)) return 'validado'
  if (CLOSED.has(status ?? '')) return 'validacao'
  if (status === 'Em resolução') return 'resolucao'
  if (status === 'Revisão técnica necessária') return 'revisao'
  return 'aberto'
}

export function pendingLabel(status: string | null | undefined, validated: boolean | null | undefined) {
  const kind = pendingKind(status, validated)
  if (kind === 'validado') return 'Validado'
  if (kind === 'validacao') return 'Aguardando validação'
  return status || 'Em aberto'
}

export function folderId(url: string) {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}

export function formatWhen(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function personName(name: string | null | undefined, email: string | null | undefined) {
  const clean = (name ?? '').trim()
  if (clean) return clean
  return email ?? 'Usuário'
}

export type Role = 'admin' | 'manager' | 'user'

export function roleOf(profile: { is_admin?: boolean | null; is_manager?: boolean | null } | null | undefined): Role {
  if (profile?.is_admin) return 'admin'
  if (profile?.is_manager) return 'manager'
  return 'user'
}

export function roleLabel(role: Role) {
  if (role === 'admin') return 'Administrador'
  if (role === 'manager') return 'Gestor da área'
  return 'Usuário da área'
}

export function canManage(profile: { is_admin?: boolean | null; is_manager?: boolean | null } | null | undefined) {
  return roleOf(profile) !== 'user'
}
