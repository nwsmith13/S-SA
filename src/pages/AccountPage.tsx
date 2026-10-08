import { useEffect, useState, type FormEvent } from 'react'
import { PageIntro } from '../components/PageIntro'
import { useAuth } from '../services/AuthContext'
import { getUserProfile, saveUserProfile } from '../services/profile'
import { isGoogleAuthEnabled, supabase } from '../services/supabase'
import { authErrorMessage } from '../services/auth-errors.js'

type AccountMode = 'sign-in' | 'create' | 'forgot'

export function AccountPage() {
  const { user, loading, configured } = useAuth()
  const [mode, setMode] = useState<AccountMode>('sign-in')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    setProfileLoading(true)
    void getUserProfile(user.id)
      .then((profile) => setDisplayName(profile?.display_name ?? ''))
      .catch(() => setError('Your profile could not be loaded. Your Library is unaffected.'))
      .finally(() => setProfileLoading(false))
  }, [user])

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
        const name = displayName.trim().replace(/\s+/g, ' ')
        if (!name) { setError('Enter your name.'); return }
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: `${window.location.origin}/auth/callback` } })
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

  const startGoogle = async (connect = false) => {
    if (!supabase || !isGoogleAuthEnabled) return
    begin()
    const redirectTo = `${window.location.origin}/auth/callback${connect ? '?next=account' : ''}`
    const result = connect
      ? await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (result.error) { setError(authErrorMessage(result.error, 'sign-in')); setSubmitting(false) }
  }

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); if (!user) return; begin()
    try {
      const profile = await saveUserProfile(user.id, displayName)
      setDisplayName(profile.display_name)
      setMessage('Your name has been saved.')
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'Your name could not be saved. Try again.')
    } finally { setSubmitting(false) }
  }

  const sendPasswordReset = async () => {
    if (!supabase || !user?.email) return; begin()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/account/reset-password` })
    if (resetError) setError(authErrorMessage(resetError, 'reset-request'))
    else setMessage('Check your email for a secure password-reset link.')
    setSubmitting(false)
  }

  const signOut = async () => {
    if (!supabase) return; begin()
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) { setError('We could not sign you out. Try again.'); setSubmitting(false) }
  }

  if (user) {
    const providers = new Set(user.identities?.map((identity) => identity.provider) ?? [])
    return <div className="workspace-page account-page"><PageIntro kicker="Account" title={displayName ? `Hello, ${displayName}.` : 'Make this account yours.'}>Your personal details and sign-in security, in one place.</PageIntro><div className="account-dashboard"><section className="account-card account-profile-card"><div className="account-card-heading"><div className="account-avatar" aria-hidden="true">{displayName.trim().charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'S'}</div><div><p className="kicker">Profile</p><h2>{displayName || 'Add your name'}</h2><p>{user.email}</p></div></div><form onSubmit={saveProfile}><label htmlFor="profile-display-name">Name</label><input id="profile-display-name" autoComplete="name" required maxLength={100} value={displayName} disabled={profileLoading} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name"/><button className="primary-button" disabled={submitting || profileLoading}>{submitting ? 'Saving…' : 'Save name'}</button></form></section><section className="account-card account-security-card"><p className="kicker">Security</p><h2>Sign-in methods</h2><div className="account-status-row"><span>Email</span><strong>{user.email_confirmed_at ? 'Verified' : 'Verification pending'}</strong></div><div className="account-status-row"><span>Password</span><strong>{providers.has('email') ? 'Enabled' : 'Available'}</strong></div>{providers.has('google') && <div className="account-status-row"><span>Google</span><strong>Connected</strong></div>}<div className="account-actions"><button type="button" className="secondary-button" disabled={submitting} onClick={() => void sendPasswordReset()}>Change password</button>{isGoogleAuthEnabled && !providers.has('google') && <button type="button" className="secondary-button" disabled={submitting} onClick={() => void startGoogle(true)}>Connect Google</button>}<button type="button" className="account-text-action account-sign-out" disabled={submitting} onClick={() => void signOut()}>Sign out</button></div></section></div>{message && <p className="account-message account-page-message" role="status">{message}</p>}{error && <p className="account-error account-page-message" role="alert">{error}</p>}</div>
  }
  const title = mode === 'sign-in' ? 'Sign in' : mode === 'create' ? 'Create account' : 'Reset your password'
  return <div className="workspace-page account-page"><PageIntro kicker="Account" title="Keep your scans with you.">Use one account to keep the same private Library across your devices.</PageIntro><section className="account-card">{loading ? <p>Checking your account…</p> : !configured ? <><h2>Cloud Library needs configuration.</h2><p>Add the Supabase URL and publishable key described in <code>.env.example</code>.</p></> : <><div className="account-mode" role="tablist" aria-label="Account options"><button role="tab" aria-selected={mode === 'sign-in'} onClick={() => changeMode('sign-in')}>Sign in</button><button role="tab" aria-selected={mode === 'create'} onClick={() => changeMode('create')}>Create account</button></div><form onSubmit={submit}><h2>{title}</h2>{mode === 'create' && <><label htmlFor="account-name">Name</label><input id="account-name" autoComplete="name" required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" /></>}<label htmlFor="account-email">Email address</label><input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />{mode !== 'forgot' && <><label htmlFor="account-password">Password</label><input id="account-password" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />{mode === 'create' && <><p className="password-requirement">Use at least 6 characters. Supabase will enforce any additional project password requirements.</p><label htmlFor="account-confirm-password">Confirm password</label><input id="account-confirm-password" type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></>}</>}{mode === 'sign-in' && <button className="account-text-action" type="button" onClick={() => changeMode('forgot')}>Forgot password?</button>}<button className="primary-button" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'create' ? 'Create account' : 'Send password-reset email'}</button>{mode === 'forgot' && <button className="account-text-action" type="button" onClick={() => changeMode('sign-in')}>Back to sign in</button>}{message && <p className="account-message" role="status">{message}</p>}{error && <p className="account-error" role="alert">{error}</p>}</form>{mode === 'sign-in' && <div className="magic-link-option"><span>or</span>{isGoogleAuthEnabled && <button type="button" disabled={submitting} onClick={() => void startGoogle()}>Continue with Google</button>}<button type="button" disabled={submitting} onClick={() => void sendMagicLink()}>Email me a sign-in link instead</button><p>Existing email-link accounts can use Forgot password once to establish a password without changing accounts.</p></div>}</>}</section></div>
}
