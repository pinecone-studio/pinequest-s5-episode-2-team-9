// Who may open which model. Pure, so it's testable.
// Without a subscription, each account gets FREE_PICKS models of its own choosing, for good.
// The labs (atoms, solar system, electromagnetism, spacetime) are free for everyone and never count as a pick.
//
// Firestore layout (see firestore.rules): freePicks/{uid}  models[] (model ids, at most 2), updatedAt
// The rules only let the list grow, so a pick can't be swapped or undone.

export const FREE_PICKS = 2

export interface Access {
  /** Subscribed, or the admin: everything is open. */
  unlimited: boolean
  /** Model ids this account picked as free. */
  picks: string[]
}

export type ModelAccess = 'open' | 'canPick' | 'locked'

export function modelAccess(access: Access, modelId: string): ModelAccess {
  if (access.unlimited || access.picks.includes(modelId)) return 'open'
  return picksLeft(access) > 0 ? 'canPick' : 'locked'
}

export const picksLeft = (access: Access) => Math.max(0, FREE_PICKS - access.picks.length)

/** Reads freePicks/{uid}.models, keeping only strings and at most FREE_PICKS of them. */
export function parsePicks(data: Record<string, unknown> | undefined): string[] {
  const models = data?.models
  if (!Array.isArray(models)) return []
  return models.filter((m): m is string => typeof m === 'string').slice(0, FREE_PICKS)
}
