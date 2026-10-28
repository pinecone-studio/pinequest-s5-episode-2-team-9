// Pure hand measurements from 21 landmarks. Landmarks must be in an isotropic
// space (x scaled by the video aspect ratio) so distances and angles are true.

import { LM, type Vec3 } from './types'

export const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export const midpoint = (a: Vec3, b: Vec3): Vec3 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
})

/** Bend at joint b in degrees: 0 when a-b-c is straight, larger when folded. */
export function bendDeg(a: Vec3, b: Vec3, c: Vec3): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z }
  const len = Math.hypot(v1.x, v1.y, v1.z) * Math.hypot(v2.x, v2.y, v2.z)
  if (len === 0) return 0
  const cos = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / len
  return 180 - (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

const FINGERS = [
  [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP],
  [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP],
  [LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP],
  [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP],
] as const

/** Hand scale: wrist to middle-finger knuckle. Used to normalize every threshold. */
export const palmSize = (lm: Vec3[]) => dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP])

/** Thumb tip to index tip, divided by palm size. ~0.15 touching, ~1.1 wide open. */
export function pinchRatio(lm: Vec3[]): number {
  const palm = palmSize(lm)
  return palm > 0 ? dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / palm : Infinity
}

/** Curl of index, middle, ring and pinky: sum of the three joint bends, in degrees. */
export function fingerCurls(lm: Vec3[]): [number, number, number, number] {
  return FINGERS.map(([mcp, pip, dip, tip]) => {
    return bendDeg(lm[LM.WRIST], lm[mcp], lm[pip]) + bendDeg(lm[mcp], lm[pip], lm[dip]) + bendDeg(lm[pip], lm[dip], lm[tip])
  }) as [number, number, number, number]
}

const FINGER_TIPS = [LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP] as const

/**
 * Farthest fingertip from the thumb tip, in palm sizes. ~0.2 when all five tips touch
 * (a "bud"), ~1.5 for an open hand. An ordinary thumb-index pinch stays high because
 * the other fingers are elsewhere, which is what separates a bud from a pinch.
 */
export function tipSpread(lm: Vec3[]): number {
  const palm = palmSize(lm)
  if (palm <= 0) return Infinity
  return Math.max(...FINGER_TIPS.map((i) => dist(lm[LM.THUMB_TIP], lm[i]))) / palm
}

/** Nearest fingertip to the wrist, in palm sizes. Low when fingers are tucked into the palm (fist, curled pinch). */
export function tipReach(lm: Vec3[]): number {
  const palm = palmSize(lm)
  if (palm <= 0) return 0
  return Math.min(...FINGER_TIPS.map((i) => dist(lm[LM.WRIST], lm[i]))) / palm
}

/** All five fingertips within this many palm sizes of the thumb tip = a bud. */
export const BUD_MAX_SPREAD = 0.45
/** Looser bud, used only to hold off a pinch while a bloom/gather is in progress. */
export const BUD_LOOSE_SPREAD = 0.8
/** Bud fingertips point forward; tucked fingertips (fist, curled pinch) sit closer to the wrist. */
export const BUD_MIN_REACH = 0.9

export interface HandPose {
  palm: number
  pinch: number
  curls: [number, number, number, number]
  /** See tipSpread. */
  spread: number
  /** See tipReach. */
  reach: number
  openPalm: boolean
  fist: boolean
  pointing: boolean
  /** All five fingertips gathered to one point, fingers reaching forward (not a fist). */
  bud: boolean
}

export interface PoseThresholds {
  extendedMaxCurl: number
  curledMinCurl: number
  fistMinCurl: number
}

export function classifyPose(lm: Vec3[], t: PoseThresholds): HandPose {
  const palm = palmSize(lm)
  const pinch = pinchRatio(lm)
  const curls = fingerCurls(lm)
  const extended = curls.map((c) => c < t.extendedMaxCurl)
  const curled = curls.map((c) => c > t.curledMinCurl)
  const thumbOut = palm > 0 && dist(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) / palm > 0.45
  const spread = tipSpread(lm)
  const reach = tipReach(lm)
  const fist = curls.every((c) => c > t.fistMinCurl)
  return {
    palm,
    pinch,
    curls,
    spread,
    reach,
    openPalm: extended.every(Boolean) && thumbOut && pinch > 0.5,
    fist,
    pointing: extended[0] && curled[1] && curled[2] && curled[3],
    bud: !fist && spread < BUD_MAX_SPREAD && reach > BUD_MIN_REACH,
  }
}

/** Converts normalized video landmarks to isotropic units (x and z scaled by aspect). */
export function toIsotropic(lm: Vec3[], aspect: number): Vec3[] {
  return lm.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z * aspect }))
}
