// @ts-check

/** @param {unknown} error @param {'sign-in'|'sign-up'|'reset-request'|'recovery'|'magic-link'} context */
export function authErrorMessage(error, context) {
  const raw = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  const message = raw.toLocaleLowerCase()
  if (message.includes('invalid login credentials')) return 'The email or password is incorrect.'
  if (message.includes('email not confirmed')) return 'Verify your email before signing in. Check your inbox for the verification message.'
  if (message.includes('user already registered') || message.includes('already been registered')) return 'An account already exists for this email. Sign in or use Forgot password.'
  if (message.includes('password') && (message.includes('weak') || message.includes('least') || message.includes('character'))) return 'That password does not meet this project’s password requirements.'
  if (message.includes('expired') || message.includes('invalid') && (context === 'recovery' || message.includes('token') || message.includes('link'))) return 'This recovery link is invalid or has expired. Request a new password-reset email.'
  if (message.includes('rate limit')) return 'Too many email requests were made recently. Wait a little while, then try again.'
  if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) return 'S&SA could not reach the authentication service. Check your connection and try again.'
  if (context === 'sign-in') return 'S&SA could not sign you in. Check your details and try again.'
  if (context === 'sign-up') return 'S&SA could not create the account. Review your details and try again.'
  if (context === 'reset-request') return 'S&SA could not send the password-reset email. Try again shortly.'
  if (context === 'recovery') return 'S&SA could not update your password. Request a new recovery link and try again.'
  return 'S&SA could not send the sign-in email. Try again shortly.'
}
