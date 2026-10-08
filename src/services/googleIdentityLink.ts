import type { UserIdentity } from '@supabase/supabase-js'

export const GOOGLE_LINK_PENDING_KEY = 'ssa.google-link.pending'
export const GOOGLE_LINK_RESULT_KEY = 'ssa.google-link.result'

export type PendingGoogleLink = {
  userId: string
  accountEmail: string
}

export type GoogleLinkResult = {
  status: 'success' | 'mismatch' | 'cancelled' | 'error'
  accountEmail?: string
  googleEmail?: string
  message?: string
}

export function readOAuthCallback(search: string, hash: string) {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const value = (key: string) => query.get(key) ?? fragment.get(key)
  const error = value('error_description') ?? value('error')
  const errorCode = value('error_code') ?? value('error')
  const normalizedError = `${errorCode ?? ''} ${error ?? ''}`.toLocaleLowerCase()
  return {
    error,
    cancelled: normalizedError.includes('access_denied') || normalizedError.includes('cancel'),
    isGoogleLink: query.get('auth_action') === 'link-google' || fragment.get('auth_action') === 'link-google',
  }
}

export function getIdentityEmail(identity: UserIdentity | undefined) {
  const email = identity?.identity_data?.email
  return typeof email === 'string' ? email.trim() : ''
}

export function emailAddressesMatch(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()
}

export function oauthOriginConfigurationError(origin: string, allowedOrigins: string[]) {
  let normalizedOrigin: string
  try {
    normalizedOrigin = new URL(origin).origin
  } catch {
    return 'Google sign-in cannot start because the current application URL is invalid.'
  }
  const normalizedAllowed = allowedOrigins.flatMap((candidate) => {
    try { return [new URL(candidate).origin] } catch { return [] }
  })
  if (normalizedAllowed.includes(normalizedOrigin)) return null
  const localGuidance = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin)
    ? ' Use the configured local app at http://localhost:5173.'
    : ''
  return `Google sign-in is not configured for ${normalizedOrigin}.${localGuidance} Add this origin to VITE_AUTH_REDIRECT_ORIGINS and add its exact /auth/callback URLs to Supabase Authentication → URL Configuration before trying again.`
}

export function readStoredValue<T>(storage: Storage, key: string): T | null {
  try {
    const value = storage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

export function writeStoredValue(storage: Storage, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value))
}
