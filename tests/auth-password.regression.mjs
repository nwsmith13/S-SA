import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { authErrorMessage } from '../src/services/auth-errors.js'

assert.equal(authErrorMessage({ message: 'Invalid login credentials' }, 'sign-in'), 'The email or password is incorrect.')
assert.match(authErrorMessage({ message: 'Email not confirmed' }, 'sign-in'), /Verify your email/)
assert.match(authErrorMessage({ message: 'User already registered' }, 'sign-up'), /already exists/)
assert.match(authErrorMessage({ message: 'Password should be at least 6 characters' }, 'sign-up'), /password requirements/)
assert.match(authErrorMessage({ message: 'Token has expired' }, 'recovery'), /invalid or has expired/)
assert.match(authErrorMessage({ message: 'Failed to fetch' }, 'sign-in'), /connection/)

const account = await readFile(new URL('../src/pages/AccountPage.tsx', import.meta.url), 'utf8')
assert.match(account, /signInWithPassword\(\{ email, password \}\)/, 'Routine sign-in must use email/password without sending email')
assert.match(account, /signUp\(\{ email, password,[\s\S]*emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/, 'Create account must use Supabase verification callback')
assert.match(account, /Account created\. Check your email and follow the verification link/, 'Create account must explain email verification')
assert.match(account, /password !== confirmPassword/, 'Create account must confirm the password')
assert.match(account, /resetPasswordForEmail\(email,[\s\S]*\/account\/reset-password/, 'Forgot password must request a recovery redirect')
assert.match(account, /shouldCreateUser: false/, 'Secondary magic link must not create a duplicate identity')
assert.match(account, /Forgot password\?/, 'Forgot password must be visible')

const reset = await readFile(new URL('../src/pages/PasswordResetPage.tsx', import.meta.url), 'utf8')
assert.match(reset, /updateUser\(\{ password \}\)/, 'Recovery session must update the existing Auth user password')
assert.doesNotMatch(reset, /signUp|insert\(/, 'Recovery must not create another account or application user record')
assert.match(reset, /invalid or has expired/, 'Invalid recovery links must receive a useful state')

const client = await readFile(new URL('../src/services/supabase.ts', import.meta.url), 'utf8')
assert.match(client, /persistSession: true/, 'Supabase sessions must persist across browser restarts')
assert.match(client, /autoRefreshToken: true/, 'Persisted sessions must refresh normally')
assert.match(client, /detectSessionInUrl: true/, 'Verification, recovery, and magic-link callbacks must remain supported')

const shell = await readFile(new URL('../src/components/AppShell.tsx', import.meta.url), 'utf8')
assert.match(shell, /supabase\?\.auth\.signOut\(\)/, 'Existing sign-out behavior must remain available')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
assert.match(app, /path="auth\/callback"/, 'Verification and magic-link callback route must exist')
assert.match(app, /path="account\/reset-password"/, 'Password recovery route must exist')

const migration = await readFile(new URL('../supabase/migrations/202610070001_cloud_library.sql', import.meta.url), 'utf8')
assert.match(migration, /user_id uuid not null references auth\.users\(id\)/, 'Library ownership must remain attached to the existing Supabase user UUID')
assert.match(migration, /user_id = auth\.uid\(\)/, 'Library RLS identity boundary must remain unchanged')

console.log(JSON.stringify({ createAccount: 'passed', emailVerification: 'passed', passwordSignIn: 'passed', incorrectPassword: 'passed', sessionPersistence: 'passed', signOut: 'passed', forgotPassword: 'passed', recoveryCallback: 'passed', setPassword: 'passed', existingIdentityPreserved: 'passed', libraryOwnershipPreserved: 'passed', authRoutes: 'passed', accountIsolation: 'passed' }, null, 2))
