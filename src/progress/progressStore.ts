import { create } from 'zustand'
import { useAuth } from '../auth/authStore'
import { emptyProgress, withAssembly, withStudied, type ModelProgress } from './progress'

interface ProgressState {
  status: 'off' | 'loading' | 'ready' | 'error'
  byModel: Record<string, ModelProgress>
  memberSince: number | null
}

// Mirrors the signed-in user's Firestore progress. Updates apply here first (instant UI), then save.
export const useProgress = create<ProgressState>()(() => ({ status: 'off', byModel: {}, memberSince: null }))

const loadFirestore = () => import('./firestore')

let uid: string | null = null
let ready: Promise<boolean> = Promise.resolve(false)

function warn(error: unknown) {
  // Saving must never break the lab; Firestore retries on its own when back online.
  console.warn('[progress]', error)
}

async function load(forUid: string, name: string | null, email: string | null): Promise<boolean> {
  useProgress.setState({ status: 'loading', byModel: {}, memberSince: null })
  try {
    const fs = await loadFirestore()
    const [memberSince, byModel] = await Promise.all([
      fs.touchProfile(forUid, name, email),
      fs.loadProgress(forUid),
    ])
    if (uid !== forUid) return false
    useProgress.setState({ status: 'ready', byModel, memberSince })
    return true
  } catch (error) {
    warn(error)
    if (uid === forUid) useProgress.setState({ status: 'error' })
    return false
  }
}

let started = false

/** Called once at startup: follows the signed-in user. */
export function startProgress(): void {
  if (started) return
  started = true
  let lastName: string | null = null
  const sync = ({ user }: ReturnType<typeof useAuth.getState>) => {
    if (!user) {
      uid = null
      ready = Promise.resolve(false)
      useProgress.setState({ status: 'off', byModel: {}, memberSince: null })
      return
    }
    if (user.uid !== uid) {
      uid = user.uid
      lastName = user.name
      ready = load(user.uid, user.name, user.email)
    } else if (user.name !== lastName) {
      // Sign-up sets the display name just after the account exists.
      lastName = user.name
      void ready
        .then(async (ok) => {
          if (ok) await (await loadFirestore()).touchProfile(user.uid, user.name, user.email)
        })
        .catch(warn)
    }
  }
  sync(useAuth.getState())
  useAuth.subscribe(sync)
}

/** Waits for the user's progress to load, so a write never races the first read. */
function update(
  modelId: string,
  change: (p: ModelProgress) => ModelProgress | null,
  save: (fs: Awaited<ReturnType<typeof loadFirestore>>, uid: string, next: ModelProgress) => Promise<void>,
) {
  const forUid = uid
  if (!forUid) return
  void ready.then(async (ok) => {
    if (!ok || uid !== forUid) return
    const current = useProgress.getState().byModel[modelId] ?? emptyProgress
    const next = change(current)
    if (!next) return
    useProgress.setState((s) => ({ byModel: { ...s.byModel, [modelId]: next } }))
    try {
      await save(await loadFirestore(), forUid, next)
    } catch (error) {
      warn(error)
    }
  })
}

export function recordOpened(modelId: string): void {
  update(
    modelId,
    (p) => ({ ...p, lastOpenedAt: Date.now() }),
    (fs, id) => fs.saveOpened(id, modelId),
  )
}

export function recordStudied(modelId: string, partId: string): void {
  update(
    modelId,
    (p) => withStudied(p, partId),
    (fs, id) => fs.saveStudied(id, modelId, partId),
  )
}

export function recordAssembly(modelId: string, ms: number): void {
  update(
    modelId,
    (p) => withAssembly(p, ms),
    // Only send a best time when this run set it.
    (fs, id, next) => fs.saveAssembly(id, modelId, next.bestAssemblyMs === ms ? ms : null),
  )
}
