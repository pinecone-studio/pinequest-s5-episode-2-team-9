import { useEffect } from 'react'
import { create } from 'zustand'
import { useAuth } from '../auth/authStore'
import { isSubscribed, type Subscription } from './subscription'

interface SubscriptionState {
  status: 'off' | 'loading' | 'ready' | 'error'
  uid: string | null
  sub: Subscription | null
}

export const useSubscriptionStore = create<SubscriptionState>()(() => ({
  status: 'off',
  uid: null,
  sub: null,
}))

let requestId = 0

/** Loads (or reloads) the signed-in user's subscription. */
export async function refreshSubscription(uid: string): Promise<void> {
  const request = ++requestId
  const prev = useSubscriptionStore.getState()
  useSubscriptionStore.setState({ status: 'loading', uid, sub: prev.uid === uid ? prev.sub : null })
  try {
    const sub = await (await import('./firestore')).loadSubscription(uid)
    if (request === requestId && useSubscriptionStore.getState().uid === uid)
      useSubscriptionStore.setState({ status: 'ready', sub })
  } catch (error) {
    console.warn('[billing]', error)
    if (request === requestId && useSubscriptionStore.getState().uid === uid)
      useSubscriptionStore.setState({ status: 'error' })
  }
}

/** Called after a confirmed payment, so the UI updates without another Firestore read. */
export function markPaid(currentPeriodEnd: number): void {
  ++requestId
  const { sub } = useSubscriptionStore.getState()
  useSubscriptionStore.setState({
    status: 'ready',
    sub: { lastPaymentAt: Date.now(), ...sub, status: 'active', currentPeriodEnd },
  })
}

/**
 * The signed-in user's subscription, fetched on first use. Gating something later is one line:
 * `const { subscribed } = useSubscription()`.
 */
export function useSubscription() {
  const uid = useAuth((s) => s.user?.uid ?? null)
  const state = useSubscriptionStore()
  useEffect(() => {
    if (!uid) {
      ++requestId
      useSubscriptionStore.setState({ status: 'off', uid: null, sub: null })
    } else if (useSubscriptionStore.getState().uid !== uid) void refreshSubscription(uid)
  }, [uid])
  const current = state.uid === uid ? state : { status: 'off' as const, sub: null }
  return { status: current.status, sub: current.sub, subscribed: isSubscribed(current.sub) }
}
