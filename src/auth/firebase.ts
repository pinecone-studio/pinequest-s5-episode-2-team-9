// Loaded on demand (dynamic import) so the Firebase SDK stays out of the first paint.
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { firebaseConfig } from './config'

export const auth = getAuth(initializeApp(firebaseConfig))

export type AuthUser = { uid: string; name: string | null; email: string | null }

const toAuthUser = (u: User): AuthUser => ({ uid: u.uid, name: u.displayName, email: u.email })

export function watchUser(listener: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(auth, (u) => listener(u ? toAuthUser(u) : null))
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password)
}

/** Creates the account and sets its display name. Returns the user with the name filled in. */
export async function signUpWithEmail(name: string, email: string, password: string): Promise<AuthUser> {
  const { user } = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(user, { displayName: name })
  return toAuthUser(user)
}

export async function resetPassword(email: string, lang: string): Promise<void> {
  auth.languageCode = lang
  await sendPasswordResetEmail(auth, email)
}

export async function logOut(): Promise<void> {
  await signOut(auth)
}
