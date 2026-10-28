import type { AdminData, AdminSubscription } from './adminData'

export type PlanState = 'active' | 'pending' | 'expired' | 'none'

/** A subscription counts as active only until its paid period ends, whatever the stored status says. */
export function planState(sub: AdminSubscription | undefined, now: number): PlanState {
  if (!sub) return 'none'
  if (sub.status === 'active')
    return sub.currentPeriodEnd !== null && sub.currentPeriodEnd > now ? 'active' : 'expired'
  return sub.status
}

export interface AdminSummary {
  registered: number
  active: number
  revenueMnt: number
  revenueThisMonthMnt: number
  /** Tögrög paid per user id. */
  paidByUser: Record<string, number>
}

export function summarize(data: AdminData, now: number): AdminSummary {
  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const paidByUser: Record<string, number> = {}
  let revenueMnt = 0
  let revenueThisMonthMnt = 0
  for (const p of data.payments) {
    if (p.status !== 'paid') continue
    revenueMnt += p.amountMnt
    paidByUser[p.uid] = (paidByUser[p.uid] ?? 0) + p.amountMnt
    if ((p.paidAt ?? p.createdAt ?? 0) >= monthStart.getTime()) revenueThisMonthMnt += p.amountMnt
  }
  return {
    registered: data.users.length,
    active: Object.values(data.subscriptions).filter((s) => planState(s, now) === 'active').length,
    revenueMnt,
    revenueThisMonthMnt,
    paidByUser,
  }
}
