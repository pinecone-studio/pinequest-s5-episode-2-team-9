// The Hopfion: a 3D spin texture n(x) built from the Hopf map, Hopf charge 1.
// R³ is wrapped onto the 3-sphere by inverse stereographic projection, then the
// Hopf fibration sends the 3-sphere to the 2-sphere of spin directions:
//
//   a = (2z + i(r² − 1)) / (1 + r²),   b = 2(x + iy) / (1 + r²),   |a|² + |b|² = 1
//   nx + i ny = 2 a b̄,   nz = |a|² − |b|²
//
// Far away (and at the centre) the spins point up; on the unit circle in the
// xy plane they point down. Every other direction is reached on a closed loop
// (its preimage), and any two of those loops link exactly once: the linking
// number is the Hopf charge. Lengths are in units of the core-ring radius.

import { cross, dot, sub, type Vec3 } from './vec'

/**
 * Spin direction at (x, y, z). `precession` rotates every spin about z by that
 * angle (uniform Larmor precession in a field along z).
 */
export function hopfSpin(x: number, y: number, z: number, precession = 0): Vec3 {
  const r2 = x * x + y * y + z * z
  const d = 1 + r2
  const ar = (2 * z) / d
  const ai = (r2 - 1) / d
  const br = (2 * x) / d
  const bi = (2 * y) / d
  // a · conj(b)
  const re = ar * br + ai * bi
  const im = ai * br - ar * bi
  const c = Math.cos(precession)
  const s = Math.sin(precession)
  return [2 * (re * c - im * s), 2 * (re * s + im * c), ar * ar + ai * ai - (br * br + bi * bi)]
}

/** Spin direction as a point on the sphere: polar angle from +z and azimuth. */
export function spinAngles(n: Vec3): { theta: number; phi: number } {
  return { theta: Math.acos(Math.max(-1, Math.min(1, n[2]))), phi: Math.atan2(n[1], n[0]) }
}

/**
 * The closed loop of points whose spin is `m` (unit vector, not straight up),
 * as `samples` points. Each one is a Hopf fibre (a great circle of the
 * 3-sphere) projected back to R³, so it is an exact circle.
 */
export function preimage(m: Vec3, samples = 256, precession = 0): Vec3[] {
  const phi = Math.atan2(m[1], m[0]) - precession
  const ma = Math.sqrt(Math.max(0, (1 + m[2]) / 2))
  const mb = Math.sqrt(Math.max(0, (1 - m[2]) / 2))
  const out: Vec3[] = []
  for (let i = 0; i < samples; i++) {
    const alpha = (i / samples) * Math.PI * 2
    // (a, b) = (|a| e^{i(φ+α)}, |b| e^{iα}) gives 2 a b̄ = sinθ e^{iφ} for every α.
    const ar = ma * Math.cos(phi + alpha)
    const ai = ma * Math.sin(phi + alpha)
    const br = mb * Math.cos(alpha)
    const bi = mb * Math.sin(alpha)
    // Invert a's imaginary part: ai = (r² − 1)/(1 + r²)  ⇒  1 + r² = 2 / (1 − ai).
    const k = 1 / (1 - ai)
    out.push([br * k, bi * k, ar * k])
  }
  return out
}

/**
 * Gauss linking integral of two closed polylines:
 * Lk = 1/4π ∮∮ (r₁ − r₂) · (dr₁ × dr₂) / |r₁ − r₂|³.
 */
export function linkingNumber(c1: Vec3[], c2: Vec3[]): number {
  let sum = 0
  for (let i = 0; i < c1.length; i++) {
    const a0 = c1[i]
    const a1 = c1[(i + 1) % c1.length]
    const da = sub(a1, a0)
    const ma: Vec3 = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, (a0[2] + a1[2]) / 2]
    for (let j = 0; j < c2.length; j++) {
      const b0 = c2[j]
      const b1 = c2[(j + 1) % c2.length]
      const db = sub(b1, b0)
      const r = sub(ma, [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, (b0[2] + b1[2]) / 2])
      const d = Math.hypot(r[0], r[1], r[2])
      sum += dot(r, cross(da, db)) / (d * d * d)
    }
  }
  return sum / (4 * Math.PI)
}

/** HSL → RGB (all 0..1). */
export function hsl(h: number, s: number, l: number): Vec3 {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

/**
 * The usual colour code for spin textures: hue = in-plane direction, light =
 * up, dark = down (kept off pure black so it still reads on a dark screen).
 */
export function spinColor(n: Vec3): Vec3 {
  const h = (Math.atan2(n[1], n[0]) / (Math.PI * 2) + 1) % 1
  const up = Math.max(-1, Math.min(1, n[2]))
  return hsl(h, 0.95, 0.5 + up * 0.42)
}

/** Directions on the equator of the sphere: their preimages are the drawn loops. */
export function equatorTargets(count: number): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const phi = (i / count) * Math.PI * 2
    return [Math.cos(phi), Math.sin(phi), 0]
  })
}
