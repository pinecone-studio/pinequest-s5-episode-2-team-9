// Geodesics in the equatorial plane of a Schwarzschild mass, in geometric
// units (G = c = 1, lengths in units of M, so the horizon is at r = 2).
// The radial equation comes from the conserved energy and angular momentum:
//   (dr/dλ)² + (1 − 2M/r)(κ + L²/r²) = E²,   dφ/dλ = L/r²
// with κ = 1 for matter (λ is proper time) and κ = 0 for light.

export interface GeoState {
  r: number
  /** dr/dλ */
  pr: number
  phi: number
}

export interface GeoParams {
  M: number
  /** Angular momentum per unit mass (signed: + is counter-clockwise). */
  L: number
  /** 1 for a massive body, 0 for light. */
  kappa: 0 | 1
  /** False drops the relativistic 3ML²/r⁴ term: plain Newtonian gravity. */
  relativistic?: boolean
}

/** d²r/dλ² = −κM/r² + L²/r³ − 3ML²/r⁴. */
export function radialAccel(r: number, p: GeoParams): number {
  const L2 = p.L * p.L
  const gr = p.relativistic === false ? 0 : (3 * p.M * L2) / (r * r * r * r)
  return (-p.kappa * p.M) / (r * r) + L2 / (r * r * r) - gr
}

/** E², conserved along a relativistic geodesic. */
export function energySquared(s: GeoState, p: GeoParams): number {
  return s.pr * s.pr + (1 - (2 * p.M) / s.r) * (p.kappa + (p.L * p.L) / (s.r * s.r))
}

/** Newtonian energy per unit mass, conserved when relativistic is false. */
export function newtonEnergy(s: GeoState, p: GeoParams): number {
  return 0.5 * s.pr * s.pr + (p.L * p.L) / (2 * s.r * s.r) - p.M / s.r
}

function derivative(s: GeoState, p: GeoParams): GeoState {
  return { r: s.pr, pr: radialAccel(s.r, p), phi: p.L / (s.r * s.r) }
}

/** One classic Runge–Kutta step of size h. */
export function step(s: GeoState, p: GeoParams, h: number): GeoState {
  const add = (a: GeoState, b: GeoState, k: number): GeoState => ({
    r: a.r + b.r * k,
    pr: a.pr + b.pr * k,
    phi: a.phi + b.phi * k,
  })
  const k1 = derivative(s, p)
  const k2 = derivative(add(s, k1, h / 2), p)
  const k3 = derivative(add(s, k2, h / 2), p)
  const k4 = derivative(add(s, k3, h), p)
  return {
    r: s.r + (h / 6) * (k1.r + 2 * k2.r + 2 * k3.r + k4.r),
    pr: s.pr + (h / 6) * (k1.pr + 2 * k2.pr + 2 * k3.pr + k4.pr),
    phi: s.phi + (h / 6) * (k1.phi + 2 * k2.phi + 2 * k3.phi + k4.phi),
  }
}

export interface Trace {
  /** Points in the orbital plane, [x, y] pairs. */
  points: Float32Array
  count: number
  /** Ended inside the horizon / past rMax. */
  captured: boolean
  escaped: boolean
  final: GeoState
}

/**
 * Follows a geodesic for up to maxSteps. The step is a fraction of r, so it
 * stays accurate close in and does not crawl far out.
 */
export function trace(
  start: GeoState,
  p: GeoParams,
  { maxSteps = 4000, stepFrac = 0.02, rMax = Infinity, fixedStep = 0 } = {},
): Trace {
  const points = new Float32Array(maxSteps * 2 + 2)
  let s = start
  let count = 0
  let captured = false
  let escaped = false
  const put = () => {
    points[count * 2] = s.r * Math.cos(s.phi)
    points[count * 2 + 1] = s.r * Math.sin(s.phi)
    count++
  }
  put()
  for (let i = 0; i < maxSteps; i++) {
    const h = fixedStep || stepFrac * s.r
    s = step(s, p, h)
    if (!(s.r > 2 * p.M * 1.001) && p.relativistic !== false) {
      captured = true
      break
    }
    put()
    if (s.r > rMax) {
      escaped = true
      break
    }
  }
  return { points, count, captured, escaped, final: s }
}

/**
 * Bound orbit with semi-latus rectum p and eccentricity e, started at
 * periapsis p/(1+e). Its angular momentum makes p/(1−e) the other turning
 * point of the exact radial equation: L² = Mp² / (p − (3 + e²)M).
 */
export function boundOrbit(M: number, p: number, e: number): { start: GeoState; L: number } {
  const L = Math.sqrt((M * p * p) / (p - (3 + e * e) * M))
  return { start: { r: p / (1 + e), pr: 0, phi: 0 }, L }
}

/**
 * A light ray coming in from far to the left (x = −x0) parallel to the x axis
 * at height b (the impact parameter), with E = 1.
 */
export function incomingRay(M: number, b: number, x0: number): { start: GeoState; L: number } {
  const r = Math.hypot(x0, b)
  const L = -b
  const pr = -Math.sqrt(Math.max(0, 1 - (1 - (2 * M) / r) * ((L * L) / (r * r))))
  return { start: { r, pr, phi: Math.atan2(b, -x0) }, L }
}

/** Weak-field perihelion advance per orbit: 6πM/p (radians). */
export function precessionPerOrbit(M: number, p: number): number {
  return (6 * Math.PI * M) / p
}

/** Weak-field bending of light passing at impact parameter b: 4M/b (radians). */
export function lightDeflection(M: number, b: number): number {
  return (4 * M) / b
}

/** Smallest impact parameter that escapes, in units of M (3√3). Closer rays spiral in. */
export const CAPTURE_B = 3 * Math.sqrt(3)

/**
 * Periapsis advance per orbit (rad), measured by integrating the bound orbit
 * through two periapsis passages rather than taken from the weak-field formula.
 */
export function measuredPrecession(M: number, p: number, e: number, h = 0.5): number {
  const { start, L } = boundOrbit(M, p, e)
  const params: GeoParams = { M, L, kappa: 1 }
  let s = start
  let prev = s
  const passes: number[] = []
  for (let i = 0; i < 2_000_000 && passes.length < 2; i++) {
    s = step(s, params, h)
    // Periapsis: dr/dλ turns from negative to positive; interpolate the crossing.
    if (prev.pr < 0 && s.pr >= 0) passes.push(prev.phi + ((s.phi - prev.phi) * -prev.pr) / (s.pr - prev.pr))
    prev = s
  }
  return passes[1] - passes[0] - 2 * Math.PI
}

/** Mercury's relativistic perihelion advance, in arcseconds per century (≈ 43″). */
export function mercuryPrecessionArcsec(): number {
  const sunM = 1476.625 // GM☉/c² in metres
  const a = 57.909e9
  const e = 0.2056
  const orbitsPerCentury = 36_525 / 87.969
  return ((precessionPerOrbit(sunM, a * (1 - e * e)) * orbitsPerCentury * 180) / Math.PI) * 3600
}
