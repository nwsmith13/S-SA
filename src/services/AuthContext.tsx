import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isCloudConfigured, supabase } from './supabase'

type AuthState = { user: User | null; session: Session | null; loading: boolean; configured: boolean }
const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true, configured: isCloudConfigured })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    return () => data.subscription.unsubscribe()
  }, [])
  const value = useMemo(() => ({ user: session?.user ?? null, session, loading, configured: isCloudConfigured }), [session, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
