import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const account = readFileSync(new URL('../src/pages/AccountPage.tsx', import.meta.url), 'utf8')
const profile = readFileSync(new URL('../src/services/profile.ts', import.meta.url), 'utf8')
const callback = readFileSync(new URL('../src/pages/AuthCallbackPage.tsx', import.meta.url), 'utf8')
const supabase = readFileSync(new URL('../src/services/supabase.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/202610070003_user_profiles.sql', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/i)
assert.match(migration, /alter table public\.user_profiles enable row level security/i)
assert.equal((migration.match(/auth\.uid\(\) = user_id/g) ?? []).length, 4, 'profile SELECT/INSERT/UPDATE checks must use auth.uid()')
assert.match(migration, /raw_user_meta_data ->> 'display_name'/)
assert.match(account, /data: \{ display_name: name \}/, 'signup must pass the name as auth metadata')
assert.match(account, /getUserProfile\(user\.id\)/, 'signed-in account must retrieve its profile')
assert.match(account, /saveUserProfile\(user\.id, displayName\)/, 'existing users must be able to save a name')
assert.match(profile, /\.eq\('user_id', userId\)/, 'profile reads must address the authenticated user row')
assert.match(profile, /\.upsert\(\{ user_id: userId, display_name: normalizedName \}/, 'profile persistence must retain auth identity')
assert.match(supabase, /VITE_GOOGLE_AUTH_ENABLED === 'true'/, 'Google must remain feature-gated')
assert.match(account, /signInWithOAuth\(\{ provider: 'google'/, 'Google OAuth must be prepared')
assert.match(account, /linkIdentity\(\{ provider: 'google'/, 'signed-in users must have a deliberate identity-linking path')
assert.match(callback, /destination.*next.*account/, 'identity-link callback must return to Account')
assert.match(styles, /@media \(min-width: 801px\)[\s\S]*account-page[\s\S]*library-page/, 'desktop density changes must be desktop-only')

console.log('Account profile and OAuth preparation regression checks passed.')
