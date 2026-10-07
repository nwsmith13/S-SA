export type AuthErrorContext = 'sign-in' | 'sign-up' | 'reset-request' | 'recovery' | 'magic-link'
export function authErrorMessage(error: unknown, context: AuthErrorContext): string
