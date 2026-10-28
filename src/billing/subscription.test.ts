import { describe, expect, it } from 'vitest'
import { isSubscribed, parseSubscription } from './subscription'

const NOW = Date.UTC(2026, 9, 28)
const ts = (ms: number) => ({ toMillis: () => ms })

describe('subscription', () => {
  it('parses Firestore timestamps', () => {
    expect(
      parseSubscription({ status: 'active', currentPeriodEnd: ts(NOW + 1), lastPaymentAt: null }),
    ).toEqual({
      status: 'active',
      currentPeriodEnd: NOW + 1,
      lastPaymentAt: null,
    })
    expect(parseSubscription(undefined)).toBeNull()
  })

  it('is subscribed only while an active period has time left', () => {
    const sub = parseSubscription({ status: 'active', currentPeriodEnd: ts(NOW + 1000) })
    expect(isSubscribed(sub, NOW)).toBe(true)
    expect(isSubscribed(sub, NOW + 1000)).toBe(false)
    expect(
      isSubscribed(parseSubscription({ status: 'pending', currentPeriodEnd: ts(NOW + 1000) }), NOW),
    ).toBe(false)
    expect(isSubscribed(null, NOW)).toBe(false)
  })
})
