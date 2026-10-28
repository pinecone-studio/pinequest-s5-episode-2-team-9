// The signed-in user's subscriptions/{uid} doc, as the client sees it. Pure, so it's testable.
import { toMillis } from '../progress/progress'
import type { SubscriptionStatus } from './pricing'

export interface Subscription {
  status: SubscriptionStatus
  /** Unix ms. In the past for someone who never paid. */
  currentPeriodEnd: number | null
  lastPaymentAt: number | null
}

const STATUSES: SubscriptionStatus[] = ['active', 'expired', 'pending']

export function parseSubscription(data: Record<string, unknown> | undefined): Subscription | null {
  if (!data) return null
  const status = STATUSES.find((s) => s === data.status) ?? 'expired'
  return {
    status,
    currentPeriodEnd: toMillis(data.currentPeriodEnd),
    lastPaymentAt: toMillis(data.lastPaymentAt),
  }
}

/**
 * True while the user has paid time left. The stored status stays 'active' after the period
 * ends (nothing runs at midnight to flip it), so the end date is what decides.
 */
export function isSubscribed(sub: Subscription | null, now = Date.now()): boolean {
  return sub?.status === 'active' && sub.currentPeriodEnd !== null && sub.currentPeriodEnd > now
}
