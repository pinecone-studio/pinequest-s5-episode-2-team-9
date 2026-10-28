// Firestore writes for subscriptions/{uid} and payments/{invoiceId} (layout in src/billing/pricing.ts).
// The invoice id is Wire's PaymentIntent id (`pi_…`).
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './admin.js'
import { extendPeriod, isActive, PLAN_AMOUNT_MNT, PLAN_ID } from './plan.js'
import type { Intent } from './wire.js'

const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null)

export type Lang = 'en' | 'mn'

/** Records a new pending invoice. The subscription turns 'pending' only if it isn't active now. */
export async function recordInvoice(
  invoiceId: string,
  user: { uid: string; email: string | null; name: string | null; lang: Lang },
): Promise<void> {
  const store = db()
  const payRef = store.doc(`payments/${invoiceId}`)
  const subRef = store.doc(`subscriptions/${user.uid}`)
  await store.runTransaction(async (tx) => {
    const sub = await tx.get(subRef)
    const now = Timestamp.now()
    const active = isActive(sub.get('status'), millis(sub.get('currentPeriodEnd')), now.toMillis())
    tx.set(payRef, {
      uid: user.uid,
      email: user.email,
      plan: PLAN_ID,
      amountMnt: PLAN_AMOUNT_MNT,
      status: 'pending',
      provider: 'wire',
      createdAt: now,
      paidAt: null,
    })
    tx.set(
      subRef,
      {
        plan: PLAN_ID,
        name: user.name,
        email: user.email,
        lang: user.lang,
        ...(!active && { status: 'pending' }),
        // A first-time subscriber has no time yet: the period "ends" now.
        ...(!sub.exists && { currentPeriodEnd: now, lastPaymentAt: null }),
      },
      { merge: true },
    )
  })
}

export type Outcome =
  | { status: 'paid'; currentPeriodEnd: number }
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'failed' }

/**
 * Brings payments/{intent.id} in line with what Wire reports. A succeeded intent extends the
 * subscription exactly once: the transaction re-reads the payment, so a webhook and a poll
 * confirming the same invoice can't both add 30 days.
 */
export async function settle(intent: Intent): Promise<Outcome> {
  const store = db()
  const payRef = store.doc(`payments/${intent.id}`)
  return store.runTransaction(async (tx): Promise<Outcome> => {
    const pay = await tx.get(payRef)
    const uid = (pay.get('uid') as string | undefined) ?? intent.metadata.uid
    if (!uid) {
      // Not one of ours (no payments/ doc, no metadata). Nothing to grant; don't make Wire retry.
      console.warn('[billing] unknown intent', intent.id)
      return { status: 'failed' }
    }
    const subRef = store.doc(`subscriptions/${uid}`)
    const sub = await tx.get(subRef)
    const stored = pay.get('status')

    if (stored === 'paid')
      return { status: 'paid', currentPeriodEnd: millis(sub.get('currentPeriodEnd')) ?? 0 }

    if (intent.status === 'succeeded') {
      // We set the amount ourselves; anything else means the intent isn't ours to honour.
      if (intent.amount !== PLAN_AMOUNT_MNT || intent.currency !== 'MNT') {
        tx.set(payRef, { status: 'failed' }, { merge: true })
        console.error('[billing] amount mismatch', intent.id, intent.amount, intent.currency)
        return { status: 'failed' }
      }
      const now = Timestamp.now()
      const end = Timestamp.fromMillis(extendPeriod(now.toMillis(), millis(sub.get('currentPeriodEnd'))))
      tx.set(
        payRef,
        {
          uid,
          plan: PLAN_ID,
          amountMnt: PLAN_AMOUNT_MNT,
          provider: 'wire',
          status: 'paid',
          paidAt: now,
          ...(!pay.exists && { email: intent.metadata.email ?? null, createdAt: now }),
        },
        { merge: true },
      )
      tx.set(
        subRef,
        {
          plan: PLAN_ID,
          status: 'active',
          currentPeriodEnd: end,
          lastPaymentAt: now,
          ...(!sub.exists && { email: intent.metadata.email ?? null }),
        },
        { merge: true },
      )
      return { status: 'paid', currentPeriodEnd: end.toMillis() }
    }

    if (intent.status === 'canceled') {
      // Canceled covers "expired unpaid" too (Wire auto-cancels after the intent's TTL).
      if (pay.exists && stored === 'pending') tx.update(payRef, { status: 'expired' })
      if (sub.get('status') === 'pending') tx.update(subRef, { status: 'expired' })
      return { status: 'expired' }
    }

    return stored === 'failed' || stored === 'expired' ? { status: stored } : { status: 'pending' }
  })
}

/** The owner of a payment, or null when the invoice doesn't exist. */
export async function paymentOwner(invoiceId: string): Promise<string | null> {
  const snap = await db().doc(`payments/${invoiceId}`).get()
  return snap.exists ? ((snap.get('uid') as string) ?? null) : null
}
