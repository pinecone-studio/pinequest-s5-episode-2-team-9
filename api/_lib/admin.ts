// Firebase Admin for the API. It bypasses firestore.rules, which is why only the server writes
// subscriptions/ and payments/.
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpError } from './http.js'

function app() {
  const existing = getApps()[0]
  if (existing) return existing
  // The service account JSON (Firebase console → Project settings → Service accounts), pasted whole.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new HttpError(500, 'not_configured', 'FIREBASE_SERVICE_ACCOUNT is not set')
  return initializeApp({ credential: cert(JSON.parse(raw)) })
}

export const db = () => getFirestore(app())

/** The signed-in caller, from the `Authorization: Bearer <Firebase ID token>` header. */
export async function requireUser(request: Request): Promise<DecodedIdToken> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) throw new HttpError(401, 'unauthenticated', 'Sign in first')
  try {
    return await getAuth(app()).verifyIdToken(token)
  } catch {
    throw new HttpError(401, 'unauthenticated', 'Sign in again')
  }
}
