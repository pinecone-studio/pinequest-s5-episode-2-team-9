import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markPaid, refreshSubscription, useSubscriptionStore } from './billingStore'
import type { Subscription } from './subscription'

const { loadSubscription } = vi.hoisted(() => ({ loadSubscription: vi.fn() }))
vi.mock('./firestore', () => ({ loadSubscription }))
vi.mock('../auth/authStore', () => ({ useAuth: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('profile subscription loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    useSubscriptionStore.setState({ status: 'off', uid: null, sub: null })
  })

  afterEach(() => vi.restoreAllMocks())

  it('recovers after a failed read and exposes loading while retrying', async () => {
    loadSubscription.mockRejectedValueOnce(new Error('Offline'))
    await refreshSubscription('customer')
    expect(useSubscriptionStore.getState().status).toBe('error')

    loadSubscription.mockResolvedValueOnce(null)
    const retry = refreshSubscription('customer')
    expect(useSubscriptionStore.getState().status).toBe('loading')
    await retry
    expect(useSubscriptionStore.getState()).toMatchObject({ status: 'ready', sub: null })
  })

  it('ignores an older request after the customer switches away and back', async () => {
    const old = deferred<Subscription | null>()
    loadSubscription.mockReturnValueOnce(old.promise).mockResolvedValue(null)
    const first = refreshSubscription('customer-a')
    await vi.waitFor(() => expect(loadSubscription).toHaveBeenCalledTimes(1))
    await refreshSubscription('customer-b')
    await refreshSubscription('customer-a')
    old.resolve({ status: 'expired', currentPeriodEnd: 100, lastPaymentAt: 50 })
    await first
    expect(useSubscriptionStore.getState()).toMatchObject({ uid: 'customer-a', status: 'ready', sub: null })
  })

  it('keeps a confirmed payment when an older subscription read finishes', async () => {
    const old = deferred<Subscription | null>()
    loadSubscription.mockReturnValueOnce(old.promise)
    const pending = refreshSubscription('customer')
    await vi.waitFor(() => expect(loadSubscription).toHaveBeenCalledTimes(1))
    markPaid(Date.now() + 86_400_000)
    old.resolve(null)
    await pending
    expect(useSubscriptionStore.getState()).toMatchObject({ status: 'ready', sub: { status: 'active' } })
  })
})
