import { useEffect } from 'react'
import { create } from 'zustand'
import { useAuth } from '../auth/authStore'
import { FREE_PICKS, type Access } from './access'
import { useSubscription } from './billingStore'
import { isAdminEmail } from './pricing'

interface PicksState {
  status: 'off' | 'loading' | 'ready' | 'error'
  uid: string | null
  picks: string[]
}

export const usePicksStore = create<PicksState>()(() => ({ status: 'off', uid: null, picks: [] }))

/** Loads (or reloads) the signed-in user's free picks. */
export async function refreshPicks(uid: string): Promise<void> {
  usePicksStore.setState({ status: 'loading', uid })
  try {
    const picks = await (await import('./firestore')).loadFreePicks(uid)
    if (usePicksStore.getState().uid === uid) usePicksStore.setState({ status: 'ready', picks })
  } catch (error) {
    console.warn('[billing]', error)
    if (usePicksStore.getState().uid === uid) usePicksStore.setState({ status: 'error' })
  }
}

/** Spends one free pick on a model. Throws when the save fails (e.g. both picks are already used). */
export async function claimPick(uid: string, modelId: string): Promise<void> {
  const { picks } = usePicksStore.getState()
  if (picks.includes(modelId)) return
  if (picks.length >= FREE_PICKS) throw new Error('No free picks left')
  await (await import('./firestore')).saveFreePick(uid, modelId)
  if (usePicksStore.getState().uid === uid)
    usePicksStore.setState((s) => ({ picks: s.picks.includes(modelId) ? s.picks : [...s.picks, modelId] }))
}

/**
 * What the signed-in user may open. `status` is 'ready' once both the subscription and the picks
 * are known; 'off' when signed out.
 */
export function useAccess(): { status: PicksState['status']; access: Access } {
  const user = useAuth((s) => s.user)
  const uid = user?.uid ?? null
  const admin = isAdminEmail(user?.email)
  const sub = useSubscription()
  const state = usePicksStore()
  useEffect(() => {
    if (!uid) usePicksStore.setState({ status: 'off', uid: null, picks: [] })
    else if (usePicksStore.getState().uid !== uid) void refreshPicks(uid)
  }, [uid])
  const picks = state.uid === uid ? state : { status: 'off' as const, picks: [] }
  const unlimited = admin || sub.subscribed
  const status = !uid
    ? 'off'
    : unlimited
      ? 'ready'
      : sub.status === 'error' || picks.status === 'error'
        ? 'error'
        : sub.status === 'ready' && picks.status === 'ready'
          ? 'ready'
          : 'loading'
  return { status, access: { unlimited, picks: picks.picks } }
}
