// One plan for now: a monthly subscription. QPay always charges in tögrög;
// the dollar figure is what English-language visitors see.
//
// Firestore layout (see firestore.rules). Only the server (Firebase Admin) writes these:
//   subscriptions/{uid}   plan, status, currentPeriodEnd, lastPaymentAt, name, email, lang
//   payments/{invoiceId}  uid, email, plan, amountMnt, status, provider, createdAt, paidAt
import type { Lang } from '../i18n'

export type PlanId = 'monthly'
export type SubscriptionStatus = 'active' | 'expired' | 'pending'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired'

export const PLANS: Record<PlanId, { amountMnt: number; amountUsd: number; days: number }> = {
  monthly: { amountMnt: 7000, amountUsd: 2, days: 30 },
}

export const ADMIN_EMAIL = 'brkh1222@gmail.com'

export const isAdminEmail = (email: string | null | undefined) => email?.toLowerCase() === ADMIN_EMAIL

/** "$2" in English, "₮7,000" in Mongolian. */
export function formatPlanPrice(plan: PlanId, lang: Lang): string {
  const p = PLANS[plan]
  return lang === 'mn' ? formatMnt(p.amountMnt) : formatUsd(p.amountUsd)
}

/** Converts a tögrög amount (what QPay charged) into the currency of the given language. */
export function formatAmount(amountMnt: number, lang: Lang): string {
  if (lang === 'mn') return formatMnt(amountMnt)
  const p = PLANS.monthly
  return formatUsd((amountMnt / p.amountMnt) * p.amountUsd)
}

const formatMnt = (n: number) => `₮${new Intl.NumberFormat('en-US').format(n)}`

const formatUsd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n)
