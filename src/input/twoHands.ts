// Two-hand recognisers.
// - PinchPair: both hands pinching. Distance ratio since the start (pull apart = >1,
//   push together = <1) and the twist of the line between the hands (roll), each behind a
//   jitter band so a steady pair of hands changes nothing.
// - PalmPush: both open palms pushed towards the camera (each palm grows on screen) = reset.
//   Needs two open palms at once AND a quick approach, which no other gesture involves.

import type { HandPose } from './handGeometry'
import type { Vec2 } from './types'

/** Hand movement inside these bands is ignored (tracking jitter). */
export const DISTANCE_BAND_PX = 4
export const TWIST_BAND = (4 * Math.PI) / 180
/** Hand distances are floored here so a ratio never explodes when the hands touch. */
const MIN_DISTANCE_PX = 20

export class PinchPair {
  readonly d0: number
  /** Hand distance and twist angle, after the jitter bands. */
  d: number
  angle: number

  constructor(a: Vec2, b: Vec2) {
    this.d0 = Math.max(MIN_DISTANCE_PX, Math.hypot(b.x - a.x, b.y - a.y))
    this.d = this.d0
    this.angle = Math.atan2(b.y - a.y, b.x - a.x)
  }

  /** Returns the distance ratio since the start and the twist (radians, screen y down) since the last update. */
  update(a: Vec2, b: Vec2): { ratio: number; turn: number } {
    this.d = follow(this.d, Math.max(MIN_DISTANCE_PX, Math.hypot(b.x - a.x, b.y - a.y)), DISTANCE_BAND_PX)
    let turn = wrapAngle(Math.atan2(b.y - a.y, b.x - a.x) - this.angle)
    if (Math.abs(turn) > TWIST_BAND) {
      turn -= Math.sign(turn) * TWIST_BAND
      this.angle = wrapAngle(this.angle + turn)
    } else {
      turn = 0
    }
    return { ratio: this.d / this.d0, turn }
  }
}

/** Each palm must grow by this factor (hand moved ~25% closer to the camera)… */
export const PUSH_GROWTH = 1.25
/** …within this window. */
export const PUSH_WINDOW_MS = 600
/** No second reset right after one. */
export const PUSH_COOLDOWN_MS = 1500

export interface PushHand {
  id: number
  pose: HandPose
  coasting: boolean
}

export class PalmPush {
  private samples = new Map<number, { time: number; palm: number }[]>()
  private cooldownUntil = 0

  /** Returns 0..1 progress (the weaker hand's) and whether the push fired this frame. */
  update(hands: PushHand[], now: number): { progress: number; fired: boolean } {
    const open = hands.filter((h) => h.pose.openPalm && !h.coasting)
    if (now < this.cooldownUntil) {
      this.samples.clear()
      return { progress: 0, fired: false }
    }
    if (open.length !== 2) {
      // A briefly lost hand keeps the history; any other pose starts over.
      if (!hands.some((h) => h.coasting)) this.samples.clear()
      return { progress: 0, fired: false }
    }
    let progress = 1
    for (const h of open) {
      const list = this.samples.get(h.id) ?? []
      list.push({ time: now, palm: h.pose.palm })
      while (list.length && now - list[0].time > PUSH_WINDOW_MS) list.shift()
      this.samples.set(h.id, list)
      const smallest = Math.min(...list.map((s) => s.palm))
      const growth = smallest > 0 ? h.pose.palm / smallest : 1
      progress = Math.min(progress, Math.max(0, (growth - 1) / (PUSH_GROWTH - 1)))
    }
    for (const id of this.samples.keys()) if (!open.some((h) => h.id === id)) this.samples.delete(id)
    if (progress >= 1) {
      this.samples.clear()
      this.cooldownUntil = now + PUSH_COOLDOWN_MS
      return { progress: 1, fired: true }
    }
    return { progress, fired: false }
  }
}

/** Moves `current` toward `target` only by how far `target` is outside the band (backlash filter). */
export function follow(current: number, target: number, band: number): number {
  const d = target - current
  return Math.abs(d) <= band ? current : target - Math.sign(d) * band
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}
