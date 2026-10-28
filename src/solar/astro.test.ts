import { describe, expect, it } from 'vitest'
import {
  daysSinceJ2000,
  length,
  moonPhase,
  moonPosition,
  planetPosition,
  scale,
  spin,
  surfacePointFacing,
  type PlanetId,
} from './astro'

const at = (iso: string) => daysSinceJ2000(Date.parse(iso))

/** Where on Earth the Sun is overhead. */
function subsolar(iso: string) {
  const d = at(iso)
  return surfacePointFacing(spin('earth', d), scale(planetPosition('earth', d), -1))
}

const helioLon = (p: PlanetId, iso: string) => {
  const [x, y] = planetPosition(p, at(iso))
  return (Math.atan2(y, x) * 180) / Math.PI
}

const angleDiff = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)

describe('Earth and Sun', () => {
  it('puts the Sun over the Tropic of Cancer at the June 2026 solstice', () => {
    expect(subsolar('2026-06-21T08:24Z').lat).toBeCloseTo(23.44, 1)
  })

  it('puts the Sun over the equator at the March 2026 equinox', () => {
    expect(Math.abs(subsolar('2026-03-20T14:46Z').lat)).toBeLessThan(0.05)
  })

  it('puts the Sun over the Tropic of Capricorn at the December 2026 solstice', () => {
    expect(subsolar('2026-12-21T20:50Z').lat).toBeCloseTo(-23.44, 1)
  })

  it('has the Sun near Greenwich at 12:00 UTC (off only by the equation of time)', () => {
    expect(Math.abs(subsolar('2026-06-21T12:00Z').lon)).toBeLessThan(1)
    // Early November the Sun runs 16 minutes fast: 4° west of Greenwich at noon UTC.
    expect(subsolar('2026-11-03T12:00Z').lon).toBeCloseTo(-4.1, 0)
  })
})

describe('planets', () => {
  it('lines Mars up with Earth at its January 2025 opposition', () => {
    expect(
      angleDiff(helioLon('mars', '2025-01-16T02:00Z'), helioLon('earth', '2025-01-16T02:00Z')),
    ).toBeLessThan(1)
  })

  it('lines Jupiter up with Earth at its January 2026 opposition', () => {
    expect(
      angleDiff(helioLon('jupiter', '2026-01-10T08:00Z'), helioLon('earth', '2026-01-10T08:00Z')),
    ).toBeLessThan(1)
  })
})

describe('Moon', () => {
  it('is full during the total lunar eclipse of 3 March 2026', () => {
    expect(moonPhase(at('2026-03-03T11:33Z')).elongation).toBeGreaterThan(178.5)
  })

  it('is new during the annular solar eclipse of 17 February 2026', () => {
    expect(moonPhase(at('2026-02-17T12:01Z')).elongation).toBeLessThan(1.5)
  })

  it('stays between perigee and apogee', () => {
    for (let d = 9000; d < 9400; d += 3.7) {
      const r = length(moonPosition(d))
      expect(r).toBeGreaterThan(356_000)
      expect(r).toBeLessThan(407_000)
    }
  })

  it('always shows Earth the same face, give or take libration', () => {
    for (let d = 9000; d < 9400; d += 5.3) {
      const { lat, lon } = surfacePointFacing(spin('moon', d), scale(moonPosition(d), -1))
      expect(Math.abs(lat)).toBeLessThan(7.5)
      expect(Math.abs(lon)).toBeLessThan(8.5)
    }
  })
})

describe('panel readouts', () => {
  it('gives Ulaanbaatar about 15¾ hours of daylight at the June solstice and 8¾ in December', async () => {
    const { daylightHours } = await import('./readouts')
    expect(daylightHours(47.92, 23.44)).toBeCloseTo(15.75, 0)
    expect(daylightHours(47.92, -23.44)).toBeCloseTo(8.7, 0)
  })

  it('names the season from the Sun’s position', async () => {
    const { season } = await import('./readouts')
    expect(season(planetPosition('earth', at('2026-07-15T00:00Z')))).toEqual({
      north: 'summer',
      south: 'winter',
    })
    expect(season(planetPosition('earth', at('2026-01-15T00:00Z')))).toEqual({
      north: 'winter',
      south: 'summer',
    })
  })

  it('calls 3 March 2026 a full Moon', async () => {
    const { phaseName } = await import('./readouts')
    expect(phaseName(moonPhase(at('2026-03-03T11:33Z')))).toBe('full')
  })
})
