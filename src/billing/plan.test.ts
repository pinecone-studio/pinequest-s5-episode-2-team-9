import { describe, expect, it } from 'vitest'
import { extendPeriod, isActive, PLAN_AMOUNT_MNT, PLAN_DAYS } from '../../api/_lib/plan'
import { PLANS } from './pricing'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 28, 12)

describe('server plan', () => {
  it('matches the client plan', () => {
    expect(PLAN_AMOUNT_MNT).toBe(PLANS.monthly.amountMnt)
    expect(PLAN_DAYS).toBe(PLANS.monthly.days)
  })
})

describe('extendPeriod', () => {
  it('starts from now for a first payment', () => {
    expect(extendPeriod(NOW, null)).toBe(NOW + 30 * DAY)
  })

  it('starts from now when the period already ended', () => {
    expect(extendPeriod(NOW, NOW - 5 * DAY)).toBe(NOW + 30 * DAY)
  })

  it('adds to the remaining time when paying early', () => {
    expect(extendPeriod(NOW, NOW + 10 * DAY)).toBe(NOW + 40 * DAY)
  })
})

describe('isActive', () => {
  it('needs both the status and time left', () => {
    expect(isActive('active', NOW + 1, NOW)).toBe(true)
    expect(isActive('active', NOW, NOW)).toBe(false)
    expect(isActive('pending', NOW + DAY, NOW)).toBe(false)
    expect(isActive('active', null, NOW)).toBe(false)
  })
})
