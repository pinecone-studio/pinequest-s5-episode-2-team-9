// Loaded on demand, only for signed-in users. Layout (see firestore.rules):
//   users/{uid}                    name, email, createdAt, lastSeenAt
//   users/{uid}/progress/{modelId} studied[], assemblies, bestAssemblyMs, lastOpenedAt, updatedAt
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { app } from '../auth/firebase'
import { parseProgress, toMillis, type ModelProgress } from './progress'

const db = getFirestore(app)

const userDoc = (uid: string) => doc(db, 'users', uid)
const progressDoc = (uid: string, modelId: string) => doc(db, 'users', uid, 'progress', modelId)

/** Creates or refreshes the profile. Returns when the account was created. */
export async function touchProfile(uid: string, name: string | null, email: string | null): Promise<number> {
  const snap = await getDoc(userDoc(uid))
  const createdAt = snap.exists() ? toMillis(snap.get('createdAt')) : null
  await setDoc(
    userDoc(uid),
    {
      name,
      email,
      lastSeenAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  )
  return createdAt ?? Date.now()
}

export async function loadProgress(uid: string): Promise<Record<string, ModelProgress>> {
  const snap = await getDocs(collection(db, 'users', uid, 'progress'))
  const byModel: Record<string, ModelProgress> = {}
  for (const d of snap.docs) byModel[d.id] = parseProgress(d.data())
  return byModel
}

// Writes merge into the document, and the array/counter updates are atomic,
// so two open tabs never overwrite each other's progress.
export function saveOpened(uid: string, modelId: string): Promise<void> {
  return setDoc(
    progressDoc(uid, modelId),
    { lastOpenedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  )
}

export function saveStudied(uid: string, modelId: string, partId: string): Promise<void> {
  return setDoc(
    progressDoc(uid, modelId),
    { studied: arrayUnion(partId), updatedAt: serverTimestamp() },
    { merge: true },
  )
}

export function saveAssembly(uid: string, modelId: string, bestAssemblyMs: number | null): Promise<void> {
  return setDoc(
    progressDoc(uid, modelId),
    {
      assemblies: increment(1),
      ...(bestAssemblyMs !== null && { bestAssemblyMs }),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
