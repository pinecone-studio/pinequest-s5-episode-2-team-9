// The server's copy of the plan. Keep in sync with PLANS in src/billing/pricing.ts
// (src/billing/plan.test.ts checks this). It lives here because Vercel compiles /api on its own.
export const PLAN_ID = 'monthly'
export const PLAN_AMOUNT_MNT = 7000
export const PLAN_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The new period end after a payment: paying early adds to the time left, paying late
 * starts from now. Never shortens a period.
 */
export function extendPeriod(nowMs: number, currentEndMs: number | null, days = PLAN_DAYS): number {
  const from = currentEndMs !== null && currentEndMs > nowMs ? currentEndMs : nowMs
  return from + days * DAY_MS
}

/** True while a stored 'active' subscription still has time left. */
export const isActive = (status: unknown, endMs: number | null, nowMs: number) =>
  status === 'active' && endMs !== null && endMs > nowMs
