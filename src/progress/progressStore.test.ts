import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { AuthUser } from '../auth/firebase'
import type { ModelProgress } from './progress'

type ProgressMap = Record<string, ModelProgress>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const user = (uid: string): AuthUser => ({ uid, name: uid, email: `${uid}@example.com` })
const saved = (part: string): ProgressMap => ({
  heart: { studied: [part], assemblies: 0, bestAssemblyMs: null, lastOpenedAt: 10 },
})

describe('profile progress loading', () => {
  let store: typeof import('./progressStore')
  let auth: UseBoundStore<StoreApi<{ user: AuthUser | null }>>
  let fs: {
    loadProgress: ReturnType<typeof vi.fn<() => Promise<ProgressMap>>>
    touchProfile: ReturnType<typeof vi.fn<() => Promise<number>>>
    saveOpened: ReturnType<typeof vi.fn<() => Promise<void>>>
    saveStudied: ReturnType<typeof vi.fn<() => Promise<void>>>
    saveAssembly: ReturnType<typeof vi.fn<() => Promise<void>>>
  }

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    auth = create<{ user: AuthUser | null }>(() => ({ user: null }))
    const lang = create(() => ({ lang: 'en' }))
    fs = {
      loadProgress: vi.fn<() => Promise<ProgressMap>>().mockResolvedValue({}),
      touchProfile: vi.fn<() => Promise<number>>().mockResolvedValue(100),
      saveOpened: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      saveStudied: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      saveAssembly: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    vi.doMock('../auth/authStore', () => ({ useAuth: auth }))
    vi.doMock('../i18n', () => ({ useLang: lang }))
    vi.doMock('./firestore', () => fs)
    store = await import('./progressStore')
    store.startProgress()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows readable progress and records study while the metadata write is offline', async () => {
    fs.touchProfile.mockReturnValue(deferred<number>().promise)
    fs.loadProgress.mockResolvedValue(saved('aorta'))
    auth.setState({ user: user('a') })

    await vi.waitFor(() => expect(store.useProgress.getState().status).toBe('ready'))
    expect(store.useProgress.getState()).toMatchObject({ byModel: saved('aorta'), memberSince: null })

    store.recordStudied('heart', 'atrium')
    await vi.waitFor(() => expect(fs.saveStudied).toHaveBeenCalledWith('a', 'heart', 'atrium'))
    expect(store.useProgress.getState().byModel.heart.studied).toEqual(['aorta', 'atrium'])
  })

  it('keeps progress available when updating the profile metadata fails', async () => {
    fs.touchProfile.mockRejectedValue(new Error('Metadata write denied'))
    fs.loadProgress.mockResolvedValue(saved('aorta'))
    auth.setState({ user: user('a') })

    await vi.waitFor(() => expect(store.useProgress.getState().status).toBe('ready'))
    expect(store.useProgress.getState().byModel).toEqual(saved('aorta'))
  })

  it('can retry a failed progress read without signing out or reloading the page', async () => {
    fs.loadProgress.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(saved('aorta'))
    auth.setState({ user: user('a') })
    await vi.waitFor(() => expect(store.useProgress.getState().status).toBe('error'))

    expect(await store.retryProgress()).toBe(true)
    expect(store.useProgress.getState()).toMatchObject({ status: 'ready', byModel: saved('aorta') })
  })

  it('ends a hung read and permits a fresh attempt', async () => {
    const hung = deferred<ProgressMap>()
    fs.loadProgress.mockReturnValueOnce(hung.promise).mockResolvedValueOnce(saved('fresh'))
    auth.setState({ user: user('a') })
    await vi.waitFor(() => expect(fs.loadProgress).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(15_000)
    expect(store.useProgress.getState().status).toBe('error')
    expect(await store.retryProgress()).toBe(true)
    hung.resolve(saved('stale'))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.useProgress.getState()).toMatchObject({ status: 'ready', byModel: saved('fresh') })
  })

  it('ignores an older read and metadata response after a retry for the same user', async () => {
    const oldRead = deferred<ProgressMap>()
    const oldMetadata = deferred<number>()
    fs.loadProgress.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(saved('fresh'))
    fs.touchProfile.mockReturnValueOnce(oldMetadata.promise).mockResolvedValueOnce(300)
    auth.setState({ user: user('a') })
    await vi.waitFor(() => expect(fs.loadProgress).toHaveBeenCalledTimes(1))

    expect(await store.retryProgress()).toBe(true)
    oldRead.resolve(saved('stale'))
    oldMetadata.resolve(100)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.useProgress.getState()).toMatchObject({
      status: 'ready',
      byModel: saved('fresh'),
      memberSince: 300,
    })
  })

  it('ignores an old session when signing into another account and back again', async () => {
    const oldRead = deferred<ProgressMap>()
    const oldMetadata = deferred<number>()
    fs.loadProgress
      .mockReturnValueOnce(oldRead.promise)
      .mockResolvedValueOnce(saved('account-b'))
      .mockResolvedValueOnce(saved('new-session-a'))
    fs.touchProfile
      .mockReturnValueOnce(oldMetadata.promise)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(300)
    auth.setState({ user: user('a') })
    await vi.waitFor(() => expect(fs.loadProgress).toHaveBeenCalledTimes(1))
    auth.setState({ user: user('b') })
    await vi.waitFor(() => expect(store.useProgress.getState().byModel).toEqual(saved('account-b')))
    auth.setState({ user: user('a') })
    await vi.waitFor(() => expect(store.useProgress.getState().byModel).toEqual(saved('new-session-a')))

    oldRead.resolve(saved('old-session-a'))
    oldMetadata.resolve(100)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.useProgress.getState()).toMatchObject({
      status: 'ready',
      byModel: saved('new-session-a'),
      memberSince: 300,
    })
  })

  it('discards outstanding progress and metadata after signing out', async () => {
    const oldRead = deferred<ProgressMap>()
    const oldMetadata = deferred<number>()
    fs.loadProgress.mockReturnValue(oldRead.promise)
    fs.touchProfile.mockReturnValue(oldMetadata.promise)
    auth.setState({ user: user('a') })
    await vi.waitFor(() => expect(fs.loadProgress).toHaveBeenCalledTimes(1))

    auth.setState({ user: null })
    oldRead.resolve(saved('old-session'))
    oldMetadata.resolve(100)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.useProgress.getState()).toEqual({ status: 'off', byModel: {}, memberSince: null })
    expect(await store.retryProgress()).toBe(false)
  })
})
