// Magnetic fields of currents (Biot–Savart), the conductor shapes the lab uses,
// and field-line tracing. Physics is in SI units (metres, amperes, teslas);
// the scene is 1 unit = 10 cm, see SCENE_M.

import { add, distance, length, scale, type Vec3 } from './vec'

/** Vacuum permeability (T·m/A). */
export const MU0 = 4e-7 * Math.PI

/** Metres per scene unit. */
export const SCENE_M = 0.1

export type Source = 'wire' | 'loop' | 'solenoid'

/** Conductor sizes, in metres. */
export const LOOP_RADIUS = 0.06
export const SOLENOID = { radius: 0.035, length: 0.16, turns: 10 }

/**
 * Exact field at p of a straight segment a→b carrying current I (from
 * integrating Biot–Savart along the segment), added into `out`.
 */
export function addSegmentField(a: Vec3, b: Vec3, current: number, p: Vec3, out: Vec3): void {
  // Written out in scalars: this runs millions of times while tracing field lines.
  const x1 = p[0] - a[0]
  const y1 = p[1] - a[1]
  const z1 = p[2] - a[2]
  const x2 = p[0] - b[0]
  const y2 = p[1] - b[1]
  const z2 = p[2] - b[2]
  const l1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1)
  const l2 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2)
  const denom = l1 * l2 * (l1 * l2 + x1 * x2 + y1 * y2 + z1 * z2)
  // On the segment's own line the field is zero (or singular on the wire).
  if (denom < 1e-30) return
  const k = ((MU0 * current) / (4 * Math.PI)) * ((l1 + l2) / denom)
  out[0] += (y1 * z2 - z1 * y2) * k
  out[1] += (z1 * x2 - x1 * z2) * k
  out[2] += (x1 * y2 - y1 * x2) * k
}

/** Field at p of current flowing along a polyline (metres → teslas). */
export function pathField(path: Vec3[], current: number, p: Vec3, closed = false): Vec3 {
  const out: Vec3 = [0, 0, 0]
  for (let i = 0; i < path.length - 1; i++) addSegmentField(path[i], path[i + 1], current, p, out)
  if (closed) addSegmentField(path[path.length - 1], path[0], current, p, out)
  return out
}

export interface Conductor {
  /** Polyline the current follows, in metres, in the direction of positive current. */
  path: Vec3[]
  closed: boolean
}

// Circles run right-handed about +y: positive current makes the field inside point up.
const ring = (r: number, phi: number, y: number): Vec3 => [r * Math.cos(phi), y, -r * Math.sin(phi)]

/** The three conductors, all with +y as their axis. */
export function conductor(source: Source): Conductor {
  if (source === 'wire') {
    // 10 m long: from a few centimetres away it is indistinguishable from an infinite wire.
    return { path: [ring(0, 0, -5), ring(0, 0, 5)], closed: false }
  }
  if (source === 'loop') {
    const n = 96
    return {
      path: Array.from({ length: n }, (_, i) => ring(LOOP_RADIUS, (i / n) * Math.PI * 2, 0)),
      closed: true,
    }
  }
  const { radius, length: len, turns } = SOLENOID
  const n = turns * 48
  return {
    path: Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n
      return ring(radius, t * turns * Math.PI * 2, (t - 0.5) * len)
    }),
    closed: false,
  }
}

/** Textbook results the numerical field is checked against. */
export const formula = {
  /** Infinite straight wire at distance r. */
  wire: (current: number, r: number) => (MU0 * current) / (2 * Math.PI * r),
  /** Circular loop, on its axis at height z above the centre. */
  loop: (current: number, radius: number, z: number) =>
    (MU0 * current * radius * radius) / (2 * (radius * radius + z * z) ** 1.5),
  /** Finite solenoid (uniform sheet of current), on its axis at height z from the centre. */
  solenoid: (current: number, radius: number, len: number, turns: number, z: number) => {
    const n = turns / len
    const a = z + len / 2
    const b = z - len / 2
    return ((MU0 * n * current) / 2) * (a / Math.hypot(a, radius) - b / Math.hypot(b, radius))
  },
}

export interface FieldLine {
  /** Points along the line, ordered in the direction of the field. */
  points: Vec3[]
  /** |B| at each point (whatever units the field function returns). */
  strength: number[]
  closed: boolean
}

export interface TraceOptions {
  step: number
  maxSteps: number
  /** Stop when the line leaves this distance from the origin. */
  bound: number
}

/**
 * Follows the field direction from a seed with fourth-order Runge–Kutta.
 * Closed lines stop when they come back to the seed; open ones are traced both
 * ways until they leave the bound, then joined.
 */
export function traceFieldLine(field: (p: Vec3) => Vec3, seed: Vec3, opts: TraceOptions): FieldLine {
  let magnitude = 0
  const dir = (p: Vec3): Vec3 | null => {
    const b = field(p)
    magnitude = length(b)
    return magnitude > 0 ? scale(b, 1 / magnitude) : null
  }
  const walk = (sign: 1 | -1) => {
    const points: Vec3[] = [seed]
    const strength: number[] = []
    const h = opts.step * sign
    let p = seed
    for (let i = 0; i < opts.maxSteps; i++) {
      const k1 = dir(p)
      // |B| at the current point comes free with the first RK stage.
      strength.push(magnitude)
      const k2 = k1 && dir(add(p, scale(k1, h / 2)))
      const k3 = k2 && dir(add(p, scale(k2, h / 2)))
      const k4 = k3 && dir(add(p, scale(k3, h)))
      if (!k1 || !k2 || !k3 || !k4) break
      const d = add(add(k1, scale(k2, 2)), add(scale(k3, 2), k4))
      p = add(p, scale(d, h / 6))
      if (i > 10 && distance(p, seed) < opts.step * 1.2) return { points, strength, closed: true }
      points.push(p)
      if (length(p) > opts.bound) break
    }
    // The last point has no RK stage of its own.
    if (strength.length < points.length) strength.push(length(field(p)))
    return { points, strength, closed: false }
  }
  const forward = walk(1)
  if (forward.closed) return forward
  const back = walk(-1)
  return {
    points: [...back.points.slice(1).reverse(), ...forward.points],
    strength: [...back.strength.slice(1).reverse(), ...forward.strength],
    closed: false,
  }
}

/** Seeds (scene units) that give an even, readable picture for each conductor. */
export function fieldSeeds(source: Source): Vec3[] {
  if (source === 'wire') {
    const seeds: Vec3[] = []
    ;[-0.8, 0, 0.8].forEach((y, j) => {
      for (const r of [0.16, 0.28, 0.42, 0.58, 0.76, 0.96]) {
        const phi = j * 0.9 + r * 2
        seeds.push(ring(r + j * 0.03, phi, y))
      }
    })
    return seeds
  }
  if (source === 'loop') {
    const seeds: Vec3[] = [[0, 0, 0]]
    for (let k = 0; k < 6; k++)
      for (const r of [0.22, 0.36, 0.46, 0.53]) seeds.push(ring(r, (k / 6) * Math.PI * 2 + 0.3, 0))
    return seeds
  }
  const seeds: Vec3[] = [[0, 0, 0]]
  for (let k = 0; k < 5; k++)
    for (const r of [0.12, 0.22, 0.29]) seeds.push(ring(r, (k / 5) * Math.PI * 2 + r * 4, 0))
  return seeds
}

/** Field lines of a conductor (scene units), for 1 A of positive current. */
export function fieldLines(source: Source): FieldLine[] {
  const { path, closed } = conductor(source)
  const field = (p: Vec3) => pathField(path, 1, scale(p, SCENE_M), closed)
  const opts: TraceOptions =
    source === 'wire'
      ? { step: 0.012, maxSteps: 700, bound: 3 }
      : { step: 0.016, maxSteps: 900, bound: source === 'loop' ? 1.7 : 1.6 }
  return fieldSeeds(source).map((s) => traceFieldLine(field, s, opts))
}

/** Probe point in scene units: beside the wire, or on the axis of the loop and solenoid. */
export const probePoint = (source: Source, probe: number): Vec3 =>
  source === 'wire' ? [probe, 0, 0] : [0, probe, 0]

export const PROBE_RANGE: Record<Source, [number, number]> = {
  wire: [0.1, 1.2],
  loop: [-1.2, 1.2],
  solenoid: [-1.2, 1.2],
}

/** Field at the probe (teslas) from Biot–Savart, and the textbook formula's magnitude for comparison. */
export function probeField(source: Source, amps: number, probe: number): { b: Vec3; textbook: number } {
  const { path, closed } = conductor(source)
  const b = pathField(path, amps, scale(probePoint(source, probe), SCENE_M), closed)
  const d = probe * SCENE_M
  const textbook =
    source === 'wire'
      ? formula.wire(Math.abs(amps), d)
      : source === 'loop'
        ? formula.loop(Math.abs(amps), LOOP_RADIUS, d)
        : formula.solenoid(Math.abs(amps), SOLENOID.radius, SOLENOID.length, SOLENOID.turns, d)
  return { b, textbook }
}
