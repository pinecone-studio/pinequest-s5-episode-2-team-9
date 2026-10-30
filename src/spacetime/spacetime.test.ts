import { describe, expect, it } from 'vitest'
import { appleAt, DIAGRAM_C, DROP_HEIGHT, EARTH_G, fallTime, properTime } from './apple'
import {
  boundOrbit,
  CAPTURE_B,
  energySquared,
  incomingRay,
  lightDeflection,
  measuredPrecession,
  mercuryPrecessionArcsec,
  newtonEnergy,
  precessionPerOrbit,
  step,
  trace,
  type GeoParams,
  type GeoState,
} from './geodesic'
import {
  C,
  compactness,
  escapeSpeed,
  infallSpeed,
  MASSES,
  riverRadius,
  schwarzschildRadius,
  secondsLostPerDay,
  timeDilation,
  visualCompactness,
} from './gravity'

describe('time dilation and the river of space', () => {
  it('gives the textbook Schwarzschild radii', () => {
    expect(schwarzschildRadius(MASSES.sun.massKg)).toBeCloseTo(2953, -1)
    expect(schwarzschildRadius(MASSES.earth.massKg) * 1000).toBeCloseTo(8.87, 1)
  })

  it('slows clocks near a mass and stops them at the horizon', () => {
    expect(timeDilation(0)).toBe(1)
    expect(timeDilation(1)).toBe(0)
    expect(timeDilation(0.5)).toBeCloseTo(Math.SQRT1_2, 12)
    // A clock on the ground loses about 60 µs a day against one far from Earth.
    const surface = compactness(MASSES.earth.massKg, MASSES.earth.radiusM)
    expect(secondsLostPerDay(surface) * 1e6).toBeCloseTo(60.1, 0)
  })

  it('reproduces the GPS gravitational clock offset (~45.7 µs/day)', () => {
    const m = MASSES.earth.massKg
    const ground = secondsLostPerDay(compactness(m, MASSES.earth.radiusM))
    const orbit = secondsLostPerDay(compactness(m, 26_561_750))
    expect((ground - orbit) * 1e6).toBeCloseTo(45.7, 0)
  })

  it('flows inward at exactly the Newtonian escape speed', () => {
    for (const body of Object.values(MASSES)) {
      for (const k of [1, 2, 10]) {
        const r = body.radiusM * k
        const river = infallSpeed(compactness(body.massKg, r)) * C
        expect(river / escapeSpeed(body.massKg, r)).toBeCloseTo(1, 12)
      }
    }
  })

  it('moves lattice parcels with dr/dt = −c√(rs/r)', () => {
    const rs = 0.1
    for (const r0 of [0.4, 1, 3]) {
      const h = 1e-6
      const dr = (riverRadius(r0, h, rs) - riverRadius(r0, -h, rs)) / (2 * h)
      expect(dr).toBeCloseTo(-Math.sqrt(rs / r0), 6)
    }
    expect(riverRadius(1, 100, rs)).toBe(0)
  })

  it('keeps the drawn compactness ordered and below the horizon', () => {
    const c = (id: keyof typeof MASSES) =>
      visualCompactness(compactness(MASSES[id].massKg, MASSES[id].radiusM))
    expect(c('earth')).toBeLessThan(c('sun'))
    expect(c('sun')).toBeLessThan(c('neutron'))
    // A neutron star is strong enough to draw at its true strength.
    expect(c('neutron')).toBeCloseTo(compactness(MASSES.neutron.massKg, MASSES.neutron.radiusM), 12)
    // The stand-in is continuous where it hands over to true values, and never reaches the horizon.
    expect(visualCompactness(0.2999)).toBeCloseTo(0.3, 3)
    expect(visualCompactness(5)).toBeLessThan(1)
  })
})

describe('the falling apple', () => {
  it('hangs still with all its motion through time', () => {
    const a = appleAt(-1, DROP_HEIGHT, EARTH_G, DIAGRAM_C)
    expect(a.height).toBe(DROP_HEIGHT)
    expect(a.angle).toBe(0)
    expect(a.timeSpeed).toBe(DIAGRAM_C)
    expect(a.spaceSpeed).toBe(0)
  })

  it('keeps its spacetime speed at c while the arrow turns', () => {
    const tf = fallTime(DROP_HEIGHT, EARTH_G)
    let last = 0
    for (let t = 0.05; t < tf; t += 0.05) {
      const a = appleAt(t, DROP_HEIGHT, EARTH_G, DIAGRAM_C)
      expect(Math.hypot(a.timeSpeed, a.spaceSpeed)).toBeCloseTo(DIAGRAM_C, 10)
      expect(a.spaceSpeed).toBeCloseTo(a.speed, 10)
      expect(a.angle).toBeGreaterThan(last)
      last = a.angle
    }
  })

  it('lands after √(2h/g) and stops', () => {
    const tf = fallTime(DROP_HEIGHT, EARTH_G)
    expect(tf).toBeCloseTo(0.782, 3)
    const a = appleAt(tf + 0.5, DROP_HEIGHT, EARTH_G, DIAGRAM_C)
    expect(a.landed).toBe(true)
    expect(a.height).toBeCloseTo(0, 10)
    expect(a.angle).toBe(0)
  })

  it('has a clock that lags only by the special-relativistic amount', () => {
    // For gt ≪ c: τ ≈ t − g²t³/(6c²).
    const g = 9.81
    const t = 0.7
    expect(properTime(t, g, C)).toBeCloseTo(t, 12)
    const c = 1000
    expect(properTime(t, g, c)).toBeCloseTo(t - (g * g * t ** 3) / (6 * c * c), 9)
  })
})

describe('Schwarzschild geodesics', () => {
  const M = 1

  it('falls from rest exactly as Newton says (radial, L = 0)', () => {
    const p: GeoParams = { M, L: 0, kappa: 1 }
    let s: GeoState = { r: 1e4, pr: 0, phi: 0 }
    const h = 0.5
    for (let i = 0; i < 200; i++) s = step(s, p, h)
    const tau = 200 * h
    expect(s.r).toBeCloseTo(1e4 - 0.5 * (M / 1e8) * tau * tau, 6)
  })

  it('conserves energy and angular momentum on a bound orbit', () => {
    const { start, L } = boundOrbit(M, 14, 0.5)
    const p: GeoParams = { M, L, kappa: 1 }
    const e0 = energySquared(start, p)
    let s = start
    for (let i = 0; i < 20_000; i++) s = step(s, p, 0.05)
    expect(energySquared(s, p)).toBeCloseTo(e0, 7)
    // L enters only through dφ/dλ = L/r², so it is conserved by construction;
    // the orbit stays between its two turning points.
    expect(s.r).toBeGreaterThan(14 / 1.5 - 1e-3)
    expect(s.r).toBeLessThan(14 / 0.5 + 1e-3)
  })

  it('advances the periapsis by about 6πM/p per orbit', () => {
    expect(measuredPrecession(M, 200, 0.3, 1) / precessionPerOrbit(M, 200)).toBeCloseTo(1, 1)
    // Much closer in the advance grows beyond the weak-field estimate.
    expect(measuredPrecession(M, 14, 0.4)).toBeGreaterThan(precessionPerOrbit(M, 14))
  })

  it("gives Mercury's 43 arcseconds per century", () => {
    expect(mercuryPrecessionArcsec()).toBeCloseTo(43, 0)
  })

  it('closes the orbit when relativity is switched off', () => {
    const { start, L } = boundOrbit(M, 30, 0.4)
    const p: GeoParams = { M, L, kappa: 1, relativistic: false }
    const e0 = newtonEnergy(start, p)
    let s = start
    let prev = s
    let first: number | null = null
    let second: number | null = null
    for (let i = 0; i < 200_000 && second === null; i++) {
      s = step(s, p, 0.2)
      if (prev.pr < 0 && s.pr >= 0) {
        if (first === null) first = s.phi
        else second = s.phi
      }
      prev = s
    }
    expect(newtonEnergy(s, p)).toBeCloseTo(e0, 8)
    expect(second! - first! - 2 * Math.PI).toBeCloseTo(0, 2)
  })

  it('bends distant light by 4M/b', () => {
    const b = 2000
    const { start, L } = incomingRay(M, b, 1e6)
    const t = trace(start, { M, L, kappa: 0 }, { maxSteps: 20_000, stepFrac: 0.002, rMax: 1.01e6 })
    expect(t.escaped).toBe(true)
    // Direction of travel at the end, compared with the initial +x direction.
    const n = t.count - 1
    const dx = t.points[n * 2] - t.points[n * 2 - 2]
    const dy = t.points[n * 2 + 1] - t.points[n * 2 - 1]
    const bend = -Math.atan2(dy, dx)
    expect(bend / lightDeflection(M, b)).toBeCloseTo(1, 1)
  })

  it('captures light aimed inside 3√3 M and lets the rest go', () => {
    const run = (b: number) => {
      const { start, L } = incomingRay(M, b, 60)
      return trace(start, { M, L, kappa: 0 }, { maxSteps: 20_000, stepFrac: 0.004, rMax: 80 })
    }
    expect(run(CAPTURE_B * 0.97).captured).toBe(true)
    expect(run(CAPTURE_B * 1.03).escaped).toBe(true)
  })
})
