import { create } from 'zustand'
import { useAuth } from '../auth/authStore'
import { useLang, type Lang } from '../i18n'
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
let generation = 0
const LOAD_TIMEOUT_MS = 15_000

function warn(error: unknown) {
  // Saving must never break the lab; Firestore retries on its own when back online.
  console.warn('[progress]', error)
}

function isCurrent(forUid: string, request: number): boolean {
  return uid === forUid && generation === request
}

function withTimeout<T>(pending: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Progress loading timed out')), LOAD_TIMEOUT_MS)
    pending.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function touchProfile(
  fs: Awaited<ReturnType<typeof loadFirestore>>,
  forUid: string,
  name: string | null,
  email: string | null,
  lang: Lang,
  request: number,
): void {
  void fs.touchProfile(forUid, name, email, lang).then(
    (memberSince) => {
      if (isCurrent(forUid, request)) useProgress.setState({ memberSince })
    },
    (error) => {
      if (isCurrent(forUid, request)) warn(error)
    },
  )
}

async function load(
  forUid: string,
  name: string | null,
  email: string | null,
  request: number,
): Promise<boolean> {
  useProgress.setState({ status: 'loading', byModel: {}, memberSince: null })
  try {
    const byModel = await withTimeout(
      loadFirestore().then((fs) => {
        if (!isCurrent(forUid, request)) return null
        // Updating lastSeenAt may wait for connectivity; it must not block readable progress.
        touchProfile(fs, forUid, name, email, useLang.getState().lang, request)
        return fs.loadProgress(forUid)
      }),
    )
    if (!byModel || !isCurrent(forUid, request)) return false
    useProgress.setState({ status: 'ready', byModel })
    return true
  } catch (error) {
    if (isCurrent(forUid, request)) {
      // Ignore late reads and metadata responses after this request has failed or timed out.
      generation += 1
      warn(error)
      useProgress.setState({ status: 'error' })
    }
    return false
  }
}

/** Reloads the current user's progress after a failed read or lost connection. */
export function retryProgress(): Promise<boolean> {
  const user = useAuth.getState().user
  if (!user) return Promise.resolve(false)
  uid = user.uid
  ready = load(user.uid, user.name, user.email, ++generation)
  return ready
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
      generation += 1
      ready = Promise.resolve(false)
      useProgress.setState({ status: 'off', byModel: {}, memberSince: null })
      return
    }
    if (user.uid !== uid) {
      uid = user.uid
      lastName = user.name
      ready = load(user.uid, user.name, user.email, ++generation)
    } else if (user.name !== lastName) {
      // Sign-up sets the display name just after the account exists.
      lastName = user.name
      const request = generation
      void ready
        .then(async (ok) => {
          if (!ok || !isCurrent(user.uid, request)) return
          const fs = await loadFirestore()
          if (isCurrent(user.uid, request))
            touchProfile(fs, user.uid, user.name, user.email, useLang.getState().lang, request)
        })
        .catch(warn)
    }
  }
  sync(useAuth.getState())
  useAuth.subscribe(sync)
  // The admin page shows prices in each user's language, so keep it current.
  useLang.subscribe((s, prev) => {
    const user = useAuth.getState().user
    if (!user || s.lang === prev.lang) return
    const request = generation
    void ready
      .then(async (ok) => {
        if (!ok || !isCurrent(user.uid, request)) return
        const fs = await loadFirestore()
        if (isCurrent(user.uid, request)) touchProfile(fs, user.uid, user.name, user.email, s.lang, request)
      })
      .catch(warn)
  })
}

/** Waits for the user's progress to load, so a write never races the first read. */
function update(
  modelId: string,
  change: (p: ModelProgress) => ModelProgress | null,
  save: (fs: Awaited<ReturnType<typeof loadFirestore>>, uid: string, next: ModelProgress) => Promise<void>,
) {
  const forUid = uid
  const request = generation
  if (!forUid) return
  void ready.then(async (ok) => {
    if (!ok || !isCurrent(forUid, request)) return
    const current = useProgress.getState().byModel[modelId] ?? emptyProgress
    const next = change(current)
    if (!next) return
    useProgress.setState((s) => ({ byModel: { ...s.byModel, [modelId]: next } }))
    try {
      const fs = await loadFirestore()
      if (isCurrent(forUid, request)) await save(fs, forUid, next)
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
