import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { useAuth } from '../services/AuthContext'
import { supabase } from '../services/supabase'
import { authErrorMessage } from '../services/auth-errors.js'

type AccountMode = 'sign-in' | 'create' | 'forgot'

export function AccountPage() {
  const { user, loading, configured } = useAuth()
  const [mode, setMode] = useState<AccountMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (user) return <Navigate to="/library" replace />

  const begin = () => { setSubmitting(true); setMessage(''); setError('') }
  const changeMode = (next: AccountMode) => { setMode(next); setPassword(''); setConfirmPassword(''); setMessage(''); setError('') }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return; begin()
    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      } else if (mode === 'create') {
        if (password !== confirmPassword) { setError('Passwords do not match.'); return }
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
        if (signUpError) throw signUpError
        if (data.user?.identities?.length === 0) { setError('An account may already exist for this email. Sign in or use Forgot password.'); return }
        setMessage('Account created. Check your email and follow the verification link before signing in.')
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/account/reset-password` })
        if (resetError) throw resetError
        setMessage('If an account exists for this email, a password-reset link is on its way.')
      }
    } catch (reason) { setError(authErrorMessage(reason, mode === 'create' ? 'sign-up' : mode === 'forgot' ? 'reset-request' : 'sign-in')) }
    finally { setSubmitting(false) }
  }

  const sendMagicLink = async () => {
    if (!supabase || !email) { setError('Enter your email address first.'); return }
    begin()
    const { error: magicError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false } })
    if (magicError) setError(authErrorMessage(magicError, 'magic-link'))
    else setMessage('Check your email for a secure sign-in link.')
    setSubmitting(false)
  }
  const title = mode === 'sign-in' ? 'Sign in' : mode === 'create' ? 'Create account' : 'Reset your password'
  return <div className="workspace-page account-page"><PageIntro kicker="Account" title="Keep your scans with you.">Use one account to keep the same private Library across your devices.</PageIntro><section className="account-card">{loading ? <p>Checking your account…</p> : !configured ? <><h2>Cloud Library needs configuration.</h2><p>Add the Supabase URL and publishable key described in <code>.env.example</code>.</p></> : <><div className="account-mode" role="tablist" aria-label="Account options"><button role="tab" aria-selected={mode === 'sign-in'} onClick={() => changeMode('sign-in')}>Sign in</button><button role="tab" aria-selected={mode === 'create'} onClick={() => changeMode('create')}>Create account</button></div><form onSubmit={submit}><h2>{title}</h2><label htmlFor="account-email">Email address</label><input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />{mode !== 'forgot' && <><label htmlFor="account-password">Password</label><input id="account-password" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />{mode === 'create' && <><p className="password-requirement">Use at least 6 characters. Supabase will enforce any additional project password requirements.</p><label htmlFor="account-confirm-password">Confirm password</label><input id="account-confirm-password" type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></>}</>}{mode === 'sign-in' && <button className="account-text-action" type="button" onClick={() => changeMode('forgot')}>Forgot password?</button>}<button className="primary-button" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'create' ? 'Create account' : 'Send password-reset email'}</button>{mode === 'forgot' && <button className="account-text-action" type="button" onClick={() => changeMode('sign-in')}>Back to sign in</button>}{message && <p className="account-message" role="status">{message}</p>}{error && <p className="account-error" role="alert">{error}</p>}</form>{mode === 'sign-in' && <div className="magic-link-option"><span>or</span><button type="button" disabled={submitting} onClick={() => void sendMagicLink()}>Email me a sign-in link instead</button><p>Existing email-link accounts can use Forgot password once to establish a password without changing accounts.</p></div>}</>}</section></div>
}
