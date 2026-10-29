// Loaded on demand. firestore.rules let users read their own subscriptions/{uid}; only the server writes it.
// freePicks/{uid} is written by the user, but the rules only let its list grow (see src/billing/access.ts).
import { arrayUnion, doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'
import { app } from '../auth/firebase'
import { parsePicks } from './access'
import { parseSubscription, type Subscription } from './subscription'

export async function loadSubscription(uid: string): Promise<Subscription | null> {
  const snap = await getDoc(doc(getFirestore(app), 'subscriptions', uid))
  return parseSubscription(snap.data())
}

export async function loadFreePicks(uid: string): Promise<string[]> {
  const snap = await getDoc(doc(getFirestore(app), 'freePicks', uid))
  return parsePicks(snap.data())
}

/** Adds a model to the user's free picks. The rules reject a third one. */
export function saveFreePick(uid: string, modelId: string): Promise<void> {
  return setDoc(
    doc(getFirestore(app), 'freePicks', uid),
    { models: arrayUnion(modelId), updatedAt: serverTimestamp() },
    { merge: true },
  )
}
