import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { useAuth } from '../services/AuthContext'
import { supabase } from '../services/supabase'

export function AccountPage() {
  const { user, loading, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (user) return <Navigate to="/library" replace />
  const signIn = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    setSubmitting(true); setMessage('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/library` } })
    setMessage(error ? error.message : 'Check your email for a secure sign-in link.')
    setSubmitting(false)
  }
  return <div className="workspace-page account-page"><PageIntro kicker="Account" title="Keep your scans with you.">Sign in once on each device to see the same private Library.</PageIntro><section className="account-card">{loading ? <p>Checking your account…</p> : !configured ? <><h2>Cloud Library needs configuration.</h2><p>Add the Supabase URL and publishable key described in <code>.env.example</code>.</p></> : <form onSubmit={signIn}><label htmlFor="account-email">Email address</label><input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="primary-button" disabled={submitting}>{submitting ? 'Sending…' : 'Email me a sign-in link'}</button>{message && <p role="status">{message}</p>}</form>}</section></div>
}
