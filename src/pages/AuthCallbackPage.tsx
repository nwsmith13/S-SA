import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../services/AuthContext'
import { authErrorMessage } from '../services/auth-errors.js'
import { supabase } from '../services/supabase'

export function AuthCallbackPage() {
  const { user } = useAuth()
  const [checked, setChecked] = useState(false)
  const parameters = new URLSearchParams(window.location.search || window.location.hash.slice(1))
  const callbackError = parameters.get('error_description') || parameters.get('error')
  useEffect(() => {
    if (!supabase || callbackError) { setChecked(true); return }
    void supabase.auth.getSession().then(() => setChecked(true)).catch(() => setChecked(true))
  }, [callbackError])
  if (user) return <Navigate to="/library" replace />
  return <div className="workspace-page auth-callback"><section className="account-card"><p className="kicker">Account</p><h1>{checked ? 'This link could not sign you in.' : 'Finishing your sign-in…'}</h1>{checked && <><p role="alert">{authErrorMessage(callbackError ? { message: callbackError } : { message: 'invalid recovery link' }, 'recovery')}</p><a className="primary-button" href="/account">Return to sign in</a></>}</section></div>
}
