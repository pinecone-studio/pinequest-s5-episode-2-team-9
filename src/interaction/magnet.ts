// Two-hand magnetic joins in assembly: how strongly a carried part is pulled into place, and
// which two loose parts may join into a pair. Pure functions, no Three or React.

import { placeable, type ModelDefinition } from '../models/ModelDefinition'

/** Pull at or above which a part clicks into place. */
export const SNAP_PULL = 0.85
/** How far (px) a wrong part is pushed back from the opening. */
export const REPEL_PX = 60

/** 0 outside the radius, rising smoothly to 1 at distance 0. */
export function magnetPull(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0
  const t = 1 - Math.max(0, distance) / radius
  return t * t * (3 - 2 * t)
}

/** The two parts attach directly (one depends on the other): which one is the parent. */
export function jointOf(
  def: ModelDefinition,
  a: string,
  b: string,
): { parent: string; child: string } | null {
  const pa = def.parts.find((p) => p.id === a)
  const pb = def.parts.find((p) => p.id === b)
  if (!pa || !pb || a === b) return null
  if (pb.dependsOn.includes(a)) return { parent: a, child: b }
  if (pa.dependsOn.includes(b)) return { parent: b, child: a }
  return null
}

/** A joined pair can go in now: the parent is placeable and the child needs nothing else. */
export function pairPlaceable(
  def: ModelDefinition,
  placed: readonly string[],
  parent: string,
  child: string,
): boolean {
  const done = new Set(placed)
  if (!placeable(def, done).includes(parent)) return false
  done.add(parent)
  return placeable(def, done).includes(child)
}
