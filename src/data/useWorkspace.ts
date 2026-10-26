import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { loadWorkspace } from '../lib/api'
import type { Profile, Workspace } from '../lib/types'

export function scopeWorkspace(data: Workspace, profile: Profile, userId: string): Workspace {
  if (profile.is_admin) return data
  if (profile.is_manager) {
    const processes = data.processes.filter((process) => process.area === profile.area)
    const ids = new Set(processes.map((process) => process.id))
    return {
      ...data,
      processes,
      items: data.items.filter((item) => ids.has(item.process_id)),
      assignments: data.assignments.filter((row) => ids.has(row.process_id) && row.status !== 'Cancelada'),
    }
  }
  const mine = data.assignments.filter((row) => row.assigned_to === userId && row.status !== 'Cancelada')
  const processIds = new Set(mine.map((row) => row.process_id))
  const itemIds = new Set(mine.map((row) => row.checklist_item_id))
  return {
    ...data,
    processes: data.processes.filter((process) => processIds.has(process.id)),
    items: data.items.filter((item) => itemIds.has(item.id)),
    assignments: mine,
  }
}

export function useWorkspace() {
  const { profile, session } = useAuth()
  const query = useQuery({
    queryKey: ['workspace'],
    queryFn: loadWorkspace,
    enabled: !!profile?.active,
  })
  const data = useMemo(() => {
    if (!query.data || !profile || !session?.user) return query.data
    return scopeWorkspace(query.data, profile, session.user.id)
  }, [query.data, profile, session?.user.id])
  return { ...query, data }
}
