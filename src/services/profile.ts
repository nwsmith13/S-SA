import { requireSupabase } from './supabase'

export type UserProfile = {
  user_id: string
  display_name: string
  created_at: string
  updated_at: string
}

export async function getUserProfile(userId: string) {
  const { data, error } = await requireSupabase()
    .from('user_profiles')
    .select('user_id, display_name, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle<UserProfile>()
  if (error) throw error
  return data
}

export async function saveUserProfile(userId: string, displayName: string) {
  const normalizedName = displayName.trim().replace(/\s+/g, ' ')
  if (!normalizedName) throw new Error('Enter your name.')
  if (normalizedName.length > 100) throw new Error('Name must be 100 characters or fewer.')
  const { data, error } = await requireSupabase()
    .from('user_profiles')
    .upsert({ user_id: userId, display_name: normalizedName }, { onConflict: 'user_id' })
    .select('user_id, display_name, created_at, updated_at')
    .single<UserProfile>()
  if (error) throw error
  return data
}
