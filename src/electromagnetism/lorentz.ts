// A charged particle in uniform E and B fields, F = q(E + v × B), integrated
// with the Boris pusher (the standard plasma-physics scheme: it rotates v
// exactly, so a pure magnetic field never changes the speed).
//
// Units are scaled: mass 1, charge ±1, B along +y. Lengths are scene units.

import { add, cross, dot, length, scale, sub, type Vec3 } from './vec'

export type EDirection = 'perp' | 'para'

export interface LorentzParams {
  /** Charge in units of e (+1 or −1); the mass is 1. */
  charge: 1 | -1
  /** |B|, along +y. */
  b: number
  /** |E|, along +x (perpendicular to B) or +y (parallel). */
  e: number
  eDir: EDirection
  speed: number
  /** Angle between the starting velocity and B, degrees (90 = a flat circle). */
  pitch: number
}

export const bVector = (p: LorentzParams): Vec3 => [0, p.b, 0]
export const eVector = (p: LorentzParams): Vec3 => (p.eDir === 'perp' ? [p.e, 0, 0] : [0, p.e, 0])

/** One Boris step: half electric kick, magnetic rotation, half electric kick, drift. Updates x and v in place. */
export function borisStep(x: Vec3, v: Vec3, qm: number, e: Vec3, b: Vec3, dt: number): void {
  const half = (qm * dt) / 2
  const vMinus = add(v, scale(e, half))
  const t = scale(b, half)
  const s = scale(t, 2 / (1 + dot(t, t)))
  const vPrime = add(vMinus, cross(vMinus, t))
  const vPlus = add(vMinus, cross(vPrime, s))
  const vNew = add(vPlus, scale(e, half))
  v[0] = vNew[0]
  v[1] = vNew[1]
  v[2] = vNew[2]
  x[0] += v[0] * dt
  x[1] += v[1] * dt
  x[2] += v[2] * dt
}

/** The total force and its two parts at a given velocity. */
export function lorentzForce(p: LorentzParams, v: Vec3): { electric: Vec3; magnetic: Vec3; total: Vec3 } {
  const electric = scale(eVector(p), p.charge)
  const magnetic = scale(cross(v, bVector(p)), p.charge)
  return { electric, magnetic, total: add(electric, magnetic) }
}

/** Larmor (gyro) radius m v⊥ / |q| B. */
export const gyroradius = (vPerp: number, b: number) => (b > 0 ? vPerp / b : Infinity)

/** Cyclotron period 2π m / |q| B (independent of speed). */
export const gyroPeriod = (b: number) => (b > 0 ? (2 * Math.PI) / b : Infinity)

/** E × B drift velocity E × B / B²: the same for either sign of charge. */
export function driftVelocity(p: LorentzParams): Vec3 {
  const b = bVector(p)
  const b2 = dot(b, b)
  return b2 > 0 ? scale(cross(eVector(p), b), 1 / b2) : [0, 0, 0]
}

/** Starting velocity: in the y–z plane, `pitch` degrees from B. */
export function startVelocity(p: LorentzParams): Vec3 {
  const a = (p.pitch * Math.PI) / 180
  return [0, p.speed * Math.cos(a), p.speed * Math.sin(a)]
}

/**
 * Starting position chosen so the motion stays on screen: the gyration circle
 * is centred on the axis, and anything that will travel along y or drift
 * along z starts from the far side.
 */
export function startPosition(p: LorentzParams): Vec3 {
  const v = startVelocity(p)
  const b = bVector(p)
  const b2 = dot(b, b)
  // Guiding centre = x + (m / q) (v × B) / B²; put it on the axis.
  const x: Vec3 = b2 > 0 ? scale(cross(v, b), -1 / (p.charge * b2)) : [0, 0, 0]
  const along = v[1] + (p.eDir === 'para' ? p.charge * p.e * 2 : 0)
  if (Math.abs(along) > 0.02) x[1] = -Math.sign(along) * 1.05
  if (p.eDir === 'perp' && p.e > 0 && p.b > 0) x[2] = -0.95
  if (p.b === 0) x[2] = -1
  return x
}

/** True once the particle has left the visible box (the scene restarts it). */
export const outOfBounds = (x: Vec3) => Math.abs(x[0]) > 1.6 || Math.abs(x[1]) > 1.3 || Math.abs(x[2]) > 1.3

/** Component of v perpendicular to B (B along y). */
export const vPerp = (v: Vec3) => length(sub(v, [0, v[1], 0]))
