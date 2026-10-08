import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emailAddressesMatch, oauthOriginConfigurationError, readOAuthCallback } from '../src/services/googleIdentityLink.ts'

const callbackSource = readFileSync(new URL('../src/pages/AuthCallbackPage.tsx', import.meta.url), 'utf8')
const accountSource = readFileSync(new URL('../src/pages/AccountPage.tsx', import.meta.url), 'utf8')
const supabaseSource = readFileSync(new URL('../src/services/supabase.ts', import.meta.url), 'utf8')
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const cancelled = readOAuthCallback('?next=account&auth_action=link-google', '#error=access_denied&error_description=User+cancelled')
assert.equal(cancelled.isGoogleLink, true)
assert.equal(cancelled.cancelled, true)
assert.equal(cancelled.error, 'User cancelled', 'fragment errors must be parsed even when query parameters exist')

const queryFailure = readOAuthCallback('?auth_action=link-google&error=server_error&error_description=Provider+failed', '#access_token=ignored')
assert.equal(queryFailure.error, 'Provider failed')
assert.equal(queryFailure.cancelled, false)

assert.equal(emailAddressesMatch('Person@Example.com', ' person@example.com '), true)
assert.equal(emailAddressesMatch('person@example.com', 'other@example.com'), false)

const configuredOrigins = ['https://s-sa.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173']
assert.equal(oauthOriginConfigurationError('http://localhost:5173', configuredOrigins), null)
assert.equal(oauthOriginConfigurationError('http://127.0.0.1:5173', configuredOrigins), null)
const wrongPortError = oauthOriginConfigurationError('http://localhost:5174', configuredOrigins)
assert.match(wrongPortError ?? '', /not configured for http:\/\/localhost:5174/)
assert.match(wrongPortError ?? '', /http:\/\/localhost:5173/)
assert.match(wrongPortError ?? '', /Supabase Authentication/)

assert.match(accountSource, /GOOGLE_LINK_PENDING_KEY/)
assert.match(accountSource, /userId: user!\.id, accountEmail: user!\.email!/, 'link initiation must preserve UUID and email')
assert.match(accountSource, /Connect the Google account for/)
assert.match(accountSource, /oauthOriginConfigurationError\(window\.location\.origin, authRedirectOrigins\)/, 'OAuth must be blocked before redirecting from an undeclared origin')
assert.match(callbackSource, /userData\.user\.id !== pending\.userId/, 'callback must compare the authenticated UUID')
assert.match(callbackSource, /getUserIdentities\(\)/, 'callback must verify provider identities')
assert.match(callbackSource, /status: 'success'/)
assert.match(callbackSource, /status: 'mismatch'/)
assert.match(callbackSource, /status: callback\.cancelled \? 'cancelled' : 'error'/)
assert.doesNotMatch(callbackSource + accountSource, /unlinkIdentity\(/, 'mismatches must never automatically unlink')
assert.match(accountSource, /Connected Google email:/)
assert.match(accountSource, /<span>Email sign-in<\/span><strong>Available<\/strong>/, 'email identity must not be presented as proof of a password')
assert.match(supabaseSource, /VITE_GOOGLE_AUTH_ENABLED === 'true'/, 'Google must remain disabled by default')
assert.match(envExample, /^VITE_GOOGLE_AUTH_ENABLED=false$/m, 'example configuration must keep Google disabled')
assert.match(envExample, /^VITE_AUTH_REDIRECT_ORIGINS=.*http:\/\/localhost:5173/m)
assert.match(packageJson.scripts.dev, /--port 5173 --strictPort/, 'development server must never silently fall forward to an unallowlisted port')

console.log('Google OAuth callback and identity-link safety regression checks passed.')
