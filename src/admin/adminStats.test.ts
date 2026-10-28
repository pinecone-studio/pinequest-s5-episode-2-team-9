import { describe, expect, it } from 'vitest'
import { formatAmount, formatPlanPrice } from '../billing/pricing'
import type { AdminData } from './adminData'
import { planState, summarize } from './adminStats'

const now = new Date(2026, 9, 28, 12).getTime()
const day = 86_400_000

const data: AdminData = {
  users: [
    { uid: 'a', name: 'A', email: 'a@x.mn', lang: 'mn', createdAt: now - 40 * day, lastSeenAt: now },
    { uid: 'b', name: 'B', email: 'b@x.com', lang: 'en', createdAt: now - 5 * day, lastSeenAt: now },
    { uid: 'c', name: null, email: 'c@x.com', lang: null, createdAt: now, lastSeenAt: now },
  ],
  subscriptions: {
    a: { uid: 'a', plan: 'monthly', status: 'active', currentPeriodEnd: now + 10 * day },
    b: { uid: 'b', plan: 'monthly', status: 'active', currentPeriodEnd: now - day },
  },
  payments: [
    {
      id: '1',
      uid: 'a',
      email: 'a@x.mn',
      plan: 'monthly',
      amountMnt: 7000,
      status: 'paid',
      createdAt: now - 20 * day,
      paidAt: now - 20 * day,
    },
    {
      id: '2',
      uid: 'a',
      email: 'a@x.mn',
      plan: 'monthly',
      amountMnt: 7000,
      status: 'paid',
      createdAt: now - 40 * day,
      paidAt: now - 40 * day,
    },
    {
      id: '3',
      uid: 'b',
      email: 'b@x.com',
      plan: 'monthly',
      amountMnt: 7000,
      status: 'pending',
      createdAt: now,
      paidAt: null,
    },
  ],
}

describe('admin summary', () => {
  it('counts only subscriptions whose paid period has not ended', () => {
    expect(planState(data.subscriptions.a, now)).toBe('active')
    expect(planState(data.subscriptions.b, now)).toBe('expired')
    expect(planState(undefined, now)).toBe('none')
  })

  it('adds up paid payments only', () => {
    const s = summarize(data, now)
    expect(s.registered).toBe(3)
    expect(s.active).toBe(1)
    expect(s.revenueMnt).toBe(14000)
    expect(s.revenueThisMonthMnt).toBe(7000)
    expect(s.paidByUser).toEqual({ a: 14000 })
  })
})

describe('prices by language', () => {
  it('shows dollars in English and tögrög in Mongolian', () => {
    expect(formatPlanPrice('monthly', 'en')).toBe('$2')
    expect(formatPlanPrice('monthly', 'mn')).toBe('₮7,000')
    expect(formatAmount(14000, 'en')).toBe('$4')
    expect(formatAmount(14000, 'mn')).toBe('₮14,000')
  })
})
