import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isCloudConfigured = Boolean(url && anonKey)
export const isGoogleAuthEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true'
export const supabase = isCloudConfigured ? createClient(url!, anonKey!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export const requireSupabase = () => {
  if (!supabase) throw new Error('Cloud Library is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}
