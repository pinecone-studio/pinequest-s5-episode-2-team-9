import { create } from 'zustand'
import { event } from '../analytics'
import { isFirebaseConfigured } from './config'
import type { AuthUser } from './firebase'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'unconfigured'
export type AuthMethod = 'google' | 'email'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
}

// Not persisted: Firebase keeps its own session (IndexedDB) and restores it on load.
export const useAuth = create<AuthState>()(() => ({
  status: isFirebaseConfigured ? 'loading' : 'unconfigured',
  user: null,
}))

const loadFirebase = () => import('./firebase')

let started = false

/** Called once at startup: loads Firebase and follows the signed-in user. */
export function startAuth(): void {
  if (started || !isFirebaseConfigured) return
  started = true
  void loadFirebase().then(({ watchUser }) =>
    watchUser((user) => useAuth.setState({ user, status: user ? 'signedIn' : 'signedOut' })),
  )
}

// Analytics get the method only — never an email or uid.
export async function signInWithGoogle(): Promise<void> {
  await (await loadFirebase()).signInWithGoogle()
  event('login', { method: 'google' })
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await (await loadFirebase()).signInWithEmail(email, password)
  event('login', { method: 'email' })
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<void> {
  const user = await (await loadFirebase()).signUpWithEmail(name, email, password)
  // onAuthStateChanged fired before the display name was set; show the name right away.
  useAuth.setState({ user, status: 'signedIn' })
  event('sign_up', { method: 'email' })
}

export async function resetPassword(email: string, lang: string): Promise<void> {
  await (await loadFirebase()).resetPassword(email, lang)
}

export async function logOut(): Promise<void> {
  await (await loadFirebase()).logOut()
}
