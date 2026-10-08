import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../services/AuthContext'
import { authErrorMessage } from '../services/auth-errors.js'
import { emailAddressesMatch, getIdentityEmail, GOOGLE_LINK_PENDING_KEY, GOOGLE_LINK_RESULT_KEY, readOAuthCallback, readStoredValue, writeStoredValue, type GoogleLinkResult, type PendingGoogleLink } from '../services/googleIdentityLink'
import { supabase } from '../services/supabase'

export function AuthCallbackPage() {
  const { user } = useAuth()
  const [checked, setChecked] = useState(false)
  const [linkHandled, setLinkHandled] = useState(false)
  const callback = readOAuthCallback(window.location.search, window.location.hash)
  const callbackError = callback.error
  const destination = new URLSearchParams(window.location.search).get('next') === 'account' ? '/account' : '/library'
  useEffect(() => {
    if (!callback.isGoogleLink) {
      if (!supabase || callbackError) { setChecked(true); return }
      void supabase.auth.getSession().then(() => setChecked(true)).catch(() => setChecked(true))
      return
    }

    const finishLink = async () => {
      const pending = readStoredValue<PendingGoogleLink>(sessionStorage, GOOGLE_LINK_PENDING_KEY)
      let result: GoogleLinkResult
      if (callbackError) {
        result = { status: callback.cancelled ? 'cancelled' : 'error', accountEmail: pending?.accountEmail, message: callback.cancelled ? 'Google connection was cancelled. Your S&SA account was not changed.' : authErrorMessage({ message: callbackError }, 'identity-link') }
      } else if (!supabase || !pending) {
        result = { status: 'error', message: 'S&SA could not verify who started this Google connection. Sign in and try again.' }
      } else {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError || !userData.user) {
          result = { status: 'error', accountEmail: pending.accountEmail, message: 'Your S&SA session could not be verified after returning from Google. Sign in and try again.' }
        } else if (userData.user.id !== pending.userId) {
          result = { status: 'error', accountEmail: pending.accountEmail, message: 'The S&SA account changed during Google connection. Google was not accepted as verified for this account.' }
        } else {
          const { data: identityData, error: identityError } = await supabase.auth.getUserIdentities()
          const googleIdentity = identityData?.identities.find((identity) => identity.provider === 'google')
          const googleEmail = getIdentityEmail(googleIdentity)
          if (identityError || !googleIdentity) {
            result = { status: 'error', accountEmail: pending.accountEmail, message: 'Google returned to S&SA, but the Google identity could not be verified as connected. Try again.' }
          } else if (!googleEmail || !emailAddressesMatch(pending.accountEmail, googleEmail)) {
            result = { status: 'mismatch', accountEmail: pending.accountEmail, googleEmail, message: 'Google is connected, but its email does not match your S&SA email. No identity was automatically removed.' }
          } else {
            result = { status: 'success', accountEmail: pending.accountEmail, googleEmail, message: 'Google was connected to your existing S&SA account.' }
          }
        }
      }
      writeStoredValue(sessionStorage, GOOGLE_LINK_RESULT_KEY, result)
      sessionStorage.removeItem(GOOGLE_LINK_PENDING_KEY)
      setLinkHandled(true)
      setChecked(true)
    }
    void finishLink().catch(() => {
      writeStoredValue(sessionStorage, GOOGLE_LINK_RESULT_KEY, { status: 'error', message: 'S&SA could not verify the Google connection. Sign in and try again.' } satisfies GoogleLinkResult)
      sessionStorage.removeItem(GOOGLE_LINK_PENDING_KEY)
      setLinkHandled(true)
      setChecked(true)
    })
  }, [callback.cancelled, callback.isGoogleLink, callbackError])
  if (callback.isGoogleLink && linkHandled) return <Navigate to="/account" replace />
  if (!callback.isGoogleLink && user) return <Navigate to={destination} replace />
  return <div className="workspace-page auth-callback"><section className="account-card"><p className="kicker">Account</p><h1>{checked ? 'This link could not sign you in.' : 'Finishing your sign-in…'}</h1>{checked && <><p role="alert">{authErrorMessage(callbackError ? { message: callbackError } : { message: 'invalid recovery link' }, 'recovery')}</p><a className="primary-button" href="/account">Return to sign in</a></>}</section></div>
}
