import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { loadWorkspace } from '../lib/api'

export function useWorkspace() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['workspace'],
    queryFn: loadWorkspace,
    enabled: !!profile?.active,
  })
}
