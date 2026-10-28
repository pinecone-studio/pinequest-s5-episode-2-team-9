// Loaded on demand. firestore.rules let users read their own subscriptions/{uid}; only the server writes it.
import { doc, getDoc, getFirestore } from 'firebase/firestore'
import { app } from '../auth/firebase'
import { parseSubscription, type Subscription } from './subscription'

export async function loadSubscription(uid: string): Promise<Subscription | null> {
  const snap = await getDoc(doc(getFirestore(app), 'subscriptions', uid))
  return parseSubscription(snap.data())
}
