import type { I18nKey } from '../i18n'

/** Maps a Firebase Auth error to a message key. `null` means say nothing (the user cancelled). */
export function authErrorKey(error: unknown): I18nKey | null {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'auth.error.credentials'
    case 'auth/email-already-in-use':
      return 'auth.error.emailInUse'
    case 'auth/invalid-email':
      return 'auth.error.invalidEmail'
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'auth.error.weakPassword'
    case 'auth/too-many-requests':
      return 'auth.error.tooMany'
    case 'auth/network-request-failed':
      return 'auth.error.network'
    case 'auth/popup-blocked':
      return 'auth.error.popupBlocked'
    case 'auth/account-exists-with-different-credential':
      return 'auth.error.otherMethod'
    default:
      return 'auth.error.generic'
  }
}

/** Only same-site paths are allowed as a post-login destination. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}
