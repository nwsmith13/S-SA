import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { useAuth } from '../services/AuthContext'
import { authErrorMessage } from '../services/auth-errors.js'
import { supabase } from '../services/supabase'

export function PasswordResetPage() {
  const { user, loading, configured } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  const updatePassword = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setSubmitting(true); setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError(authErrorMessage(updateError, 'recovery'))
    else { setComplete(true); setPassword(''); setConfirmPassword('') }
    setSubmitting(false)
  }
  return <div className="workspace-page account-page"><PageIntro kicker="Account recovery" title="Choose a new password.">Your Library stays attached to the same Supabase account and user identity.</PageIntro><section className="account-card">{loading ? <p>Checking your recovery link…</p> : !configured ? <p>Cloud Library is not configured.</p> : complete ? <div className="account-success"><h2>Password updated.</h2><p>You can now use email and password for routine sign-in. No new account was created.</p><Link className="primary-button" to="/library">Return to Library</Link></div> : !user ? <div className="account-error-state"><h2>This recovery link is invalid or has expired.</h2><p>Request a new password-reset email from the sign-in screen.</p><Link className="primary-button" to="/account">Request another link</Link></div> : <form onSubmit={updatePassword}><h2>Set new password</h2><p className="password-requirement">Use at least 6 characters. Supabase will enforce any additional project password requirements.</p><label htmlFor="reset-password">New password</label><input id="reset-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /><label htmlFor="reset-password-confirm">Confirm new password</label><input id="reset-password-confirm" type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /><button className="primary-button" disabled={submitting}>{submitting ? 'Updating…' : 'Set new password'}</button>{error && <p className="account-error" role="alert">{error}</p>}</form>}</section></div>
}
