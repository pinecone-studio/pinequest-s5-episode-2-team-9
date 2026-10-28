// Small derived values for the panel.
import type { Vec3 } from './astro'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** Astronomical seasons from the Sun's ecliptic longitude (0° at the March equinox). */
export function season(earthHelio: Vec3): { north: Season; south: Season } {
  const sunLon = ((Math.atan2(-earthHelio[1], -earthHelio[0]) * 180) / Math.PI + 360) % 360
  const order: Season[] = ['spring', 'summer', 'autumn', 'winter']
  const k = Math.floor(sunLon / 90)
  return { north: order[k], south: order[(k + 2) % 4] }
}

/**
 * Hours from sunrise to sunset at latitude `lat` when the Sun is overhead at
 * latitude `declination`. Uses the Sun's upper edge and refraction (−0.833°).
 */
export function daylightHours(lat: number, declination: number): number {
  const r = Math.PI / 180
  const cosH =
    (Math.sin(-0.833 * r) - Math.sin(lat * r) * Math.sin(declination * r)) /
    (Math.cos(lat * r) * Math.cos(declination * r))
  if (cosH <= -1) return 24
  if (cosH >= 1) return 0
  return (2 * Math.acos(cosH)) / r / 15
}

export type PhaseName =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent'

export function phaseName({ elongation, waxing }: { elongation: number; waxing: boolean }): PhaseName {
  if (elongation < 7) return 'new'
  if (elongation > 173) return 'full'
  if (Math.abs(elongation - 90) < 7) return waxing ? 'firstQuarter' : 'lastQuarter'
  if (elongation < 90) return waxing ? 'waxingCrescent' : 'waningCrescent'
  return waxing ? 'waxingGibbous' : 'waningGibbous'
}
