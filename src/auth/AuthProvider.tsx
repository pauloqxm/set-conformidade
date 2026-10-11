import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { loadProfile } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

type AuthValue = {
  loading: boolean
  session: Session | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  async function refreshProfile(next = session) {
    if (!next?.user) {
      setProfile(null)
      return
    }
    setProfile(await loadProfile(next.user.id))
  }

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (data.session?.user) setProfile(await loadProfile(data.session.user.id))
      setLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next?.user) {
        setProfile(null)
        return
      }
      void loadProfile(next.user.id).then((row) => {
        if (alive) setProfile(row)
      })
    })
    return () => {
      alive = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      session,
      profile,
      refreshProfile: () => refreshProfile(session),
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [loading, session, profile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth fora do AuthProvider')
  return value
}
