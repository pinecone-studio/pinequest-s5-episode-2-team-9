import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from './firebase'

const mocks = vi.hoisted(() => ({
  configured: true,
  loadError: null as Error | null,
  watchUser: vi.fn<(listener: (user: AuthUser | null) => void) => () => void>(),
}))

vi.mock('./config', () => ({
  get isFirebaseConfigured() {
    return mocks.configured
  },
}))
vi.mock('../analytics', () => ({ event: vi.fn() }))
vi.mock('./firebase', () => {
  if (mocks.loadError) throw mocks.loadError
  return { watchUser: mocks.watchUser }
})

describe('auth startup', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.configured = true
    mocks.loadError = null
    mocks.watchUser.mockReset()
    mocks.watchUser.mockImplementation((listener) => {
      listener(null)
      return () => {}
    })
  })

  it('handles a rejected Firebase import and exposes a recoverable error', async () => {
    mocks.loadError = new Error('Firebase failed to load')
    const { startAuth, useAuth } = await import('./authStore')

    await expect(startAuth()).resolves.toBeUndefined()

    expect(useAuth.getState()).toEqual({ user: null, status: 'error' })
    expect(mocks.watchUser).not.toHaveBeenCalled()
  })

  it('handles observer initialization failure and retries with a loading state', async () => {
    mocks.watchUser.mockImplementationOnce(() => {
      throw new Error('Firebase could not initialize')
    })
    const { startAuth, useAuth } = await import('./authStore')
    await expect(startAuth()).resolves.toBeUndefined()
    expect(useAuth.getState().status).toBe('error')

    const retry = startAuth()
    expect(useAuth.getState().status).toBe('loading')
    await retry

    expect(useAuth.getState()).toEqual({ user: null, status: 'signedOut' })
    expect(mocks.watchUser).toHaveBeenCalledTimes(2)
  })

  it('registers one observer across concurrent and subsequent successful starts', async () => {
    const user = { uid: 'customer-1', name: 'Customer', email: 'customer@example.com' }
    mocks.watchUser.mockImplementation((listener) => {
      listener(user)
      return () => {}
    })
    const { startAuth, useAuth } = await import('./authStore')

    const first = startAuth()
    expect(startAuth()).toBe(first)
    await first
    await startAuth()

    expect(mocks.watchUser).toHaveBeenCalledTimes(1)
    expect(useAuth.getState()).toEqual({ user, status: 'signedIn' })
  })

  it('keeps auth unconfigured without loading Firebase', async () => {
    mocks.configured = false
    const { startAuth, useAuth } = await import('./authStore')

    await expect(startAuth()).resolves.toBeUndefined()

    expect(useAuth.getState()).toEqual({ user: null, status: 'unconfigured' })
    expect(mocks.watchUser).not.toHaveBeenCalled()
  })
})
