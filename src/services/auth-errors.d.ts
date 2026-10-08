export type AuthErrorContext = 'sign-in' | 'sign-up' | 'reset-request' | 'recovery' | 'magic-link' | 'identity-link'
export function authErrorMessage(error: unknown, context: AuthErrorContext): string
