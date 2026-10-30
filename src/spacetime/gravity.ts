// Gravitational time dilation and the "river model" of spacetime around a
// non-rotating mass (Schwarzschild geometry in Gullstrand–Painlevé form).
// Pure functions; SI units unless a name says otherwise.

export const G = 6.674_30e-11
export const C = 299_792_458
export const DAY_S = 86_400

export type MassId = 'earth' | 'sun' | 'neutron'

export interface MassBody {
  massKg: number
  radiusM: number
  color: string
}

export const MASSES: Record<MassId, MassBody> = {
  earth: { massKg: 5.9722e24, radiusM: 6.371e6, color: '#5ea8ff' },
  sun: { massKg: 1.988_47e30, radiusM: 6.957e8, color: '#ffc861' },
  // A typical neutron star: 1.4 solar masses packed into a 12 km radius.
  neutron: { massKg: 1.4 * 1.988_47e30, radiusM: 1.2e4, color: '#b9d4ff' },
}

/** Radius of the event horizon the mass would have if squeezed small enough: 2GM/c². */
export function schwarzschildRadius(massKg: number): number {
  return (2 * G * massKg) / (C * C)
}

/** rs / r: 0 far away, 1 at the horizon. Every effect below depends only on this. */
export function compactness(massKg: number, r: number): number {
  return schwarzschildRadius(massKg) / r
}

/**
 * How fast a clock held still at radius r ticks compared with one far away:
 * dτ/dt = √(1 − rs/r). Zero at (and inside) the horizon.
 */
export function timeDilation(rsOverR: number): number {
  return Math.sqrt(Math.max(0, 1 - rsOverR))
}

/** Seconds a clock held at radius r loses per day against a clock far away. */
export function secondsLostPerDay(rsOverR: number): number {
  return DAY_S * (1 - timeDilation(rsOverR))
}

/**
 * Speed of the inflowing "river" of space at radius r, as a fraction of c:
 * v/c = √(rs/r). A freely falling observer dropped from rest far away moves
 * with it, so it equals the Newtonian escape speed.
 */
export function infallSpeed(rsOverR: number): number {
  return Math.sqrt(Math.max(0, rsOverR))
}

/** Newtonian escape speed √(2GM/r), in m/s. */
export function escapeSpeed(massKg: number, r: number): number {
  return Math.sqrt((2 * G * massKg) / r)
}

/**
 * Radius after time t of a parcel of space that started at r0 (any length
 * unit, with c and rs in that unit). From dr/dt = −c√(rs/r): r^{3/2} falls
 * linearly, so the whole lattice can be animated by one shifting number.
 */
export function riverRadius(r0: number, t: number, rs: number, c = 1): number {
  const u = Math.pow(r0, 1.5) - 1.5 * Math.sqrt(rs) * c * t
  return u > 0 ? Math.pow(u, 2 / 3) : 0
}

/**
 * Surface compactness used for the picture. Real values span from 10⁻⁹
 * (Earth) to 0.35 (neutron star), far too wide to draw, so weak fields get a
 * logarithmic stand-in (the panel reports the exaggeration) and strong ones,
 * from 0.3 up, are drawn true.
 */
export function visualCompactness(real: number): number {
  if (real >= 0.3) return Math.min(0.9, real)
  return Math.max(0.04, 0.06 + 0.0283 * (Math.log10(real) + 9))
}

/** Real and drawn surface compactness of a body whose mass is scaled by massScale. */
export function surfaceCompactness(id: MassId, massScale: number): { real: number; visual: number } {
  const b = MASSES[id]
  const real = compactness(b.massKg * massScale, b.radiusM)
  return { real, visual: visualCompactness(real) }
}
