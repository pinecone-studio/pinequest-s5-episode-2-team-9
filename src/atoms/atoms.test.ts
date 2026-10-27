import { describe, expect, it } from 'vitest'
import { describeAtom, shellFilling } from './elements'
import { energyEv, laguerre, mulberry32, orbitalName, psi, radial, sampleOrbital } from './orbitals'
import { band, emissionWavelengthNm, wavelengthToRgb } from './spectrum'
import { runSpin, sampleLanding, slitIntensity } from './quantumExperiments'

describe('hydrogen orbitals', () => {
  it('Laguerre polynomials match known forms', () => {
    // L_1^α(x) = 1 + α − x ; L_2^1(x) = (x² − 6x + 6)/2
    expect(laguerre(1, 3, 2)).toBeCloseTo(2)
    expect(laguerre(2, 1, 1.5)).toBeCloseTo((1.5 ** 2 - 9 + 6) / 2)
  })

  it('radial functions are normalized: ∫ R² r² dr = 1', () => {
    for (const [n, l] of [
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
      [3, 0],
    ]) {
      let sum = 0
      const dr = 0.01
      for (let r = 0; r < 120; r += dr) sum += radial(n, l, r) ** 2 * r * r * dr
      expect(sum, `${n},${l}`).toBeCloseTo(1, 2)
    }
  })

  it('has the right number of radial nodes (n − l − 1)', () => {
    for (const [n, l] of [
      [3, 0],
      [4, 1],
      [2, 1],
    ]) {
      let sign = Math.sign(radial(n, l, 0.05))
      let nodes = 0
      for (let r = 0.05; r < 60; r += 0.01) {
        const s = Math.sign(radial(n, l, r))
        if (s !== 0 && s !== sign) {
          nodes++
          sign = s
        }
      }
      expect(nodes).toBe(n - l - 1)
    }
  })

  it('2p z orbital is zero in the xy plane and opposite in sign above/below', () => {
    const q = { n: 2, l: 1, m: 0 }
    expect(psi(q, 1, 1, 0)).toBeCloseTo(0)
    expect(Math.sign(psi(q, 0, 0, 2))).toBe(-Math.sign(psi(q, 0, 0, -2)))
  })

  it('samples a 1s cloud whose mean radius is 1.5 a₀', () => {
    const s = sampleOrbital({ n: 1, l: 0, m: 0 }, 20000)
    let mean = 0
    for (let i = 0; i < 20000; i++)
      mean += Math.hypot(s.positions[i * 3], s.positions[i * 3 + 1], s.positions[i * 3 + 2])
    expect(mean / 20000).toBeGreaterThan(1.3)
    expect(mean / 20000).toBeLessThan(1.7)
  })

  it('names orbitals and energies', () => {
    expect(orbitalName({ n: 3, l: 2, m: 0 })).toBe('3d z²')
    expect(orbitalName({ n: 1, l: 0, m: 0 })).toBe('1s')
    expect(energyEv(2)).toBeCloseTo(-3.4, 1)
  })
})

describe('hydrogen spectrum', () => {
  it('gives the Balmer lines', () => {
    expect(emissionWavelengthNm(3, 2)).toBeCloseTo(656.5, 0)
    expect(emissionWavelengthNm(4, 2)).toBeCloseTo(486.3, 0)
    expect(band(emissionWavelengthNm(2, 1))).toBe('ultraviolet')
    expect(band(emissionWavelengthNm(4, 3))).toBe('infrared')
  })

  it('colours red light red and blue light blue', () => {
    const [r, g, b] = wavelengthToRgb(656)
    expect(r).toBeGreaterThan(g + b)
    const [r2, , b2] = wavelengthToRgb(450)
    expect(b2).toBeGreaterThan(r2)
  })
})

describe('atom builder', () => {
  it('identifies elements, isotopes, ions and stability', () => {
    expect(describeAtom(6, 6, 6)).toMatchObject({ massNumber: 12, charge: 0, stability: 'stable' })
    expect(describeAtom(6, 8, 6).stability).toBe('unstable')
    expect(describeAtom(11, 12, 10).charge).toBe(1)
    expect(describeAtom(0, 1, 0).stability).toBe('none')
  })

  it('fills shells 2, 8, 8, 2', () => {
    expect(shellFilling(20)).toEqual([2, 8, 8, 2])
    expect(shellFilling(11)).toEqual([2, 8, 1])
  })
})

describe('quantum experiments', () => {
  const setup = { wavelength: 1, separation: 6, width: 1.2, distance: 200, observed: false }

  it('double slit has a bright centre and dark fringes when unobserved', () => {
    expect(slitIntensity(0, setup)).toBeCloseTo(1)
    const firstDark = (setup.distance * setup.wavelength) / (2 * setup.separation)
    expect(slitIntensity(firstDark, setup)).toBeLessThan(0.01)
  })

  it('observing which slit removes the dark fringes', () => {
    const firstDark = (setup.distance * setup.wavelength) / (2 * setup.separation)
    expect(slitIntensity(firstDark, { ...setup, observed: true })).toBeGreaterThan(0.3)
  })

  it('samples landings inside the screen', () => {
    const rand = mulberry32(3)
    for (let i = 0; i < 50; i++) expect(Math.abs(sampleLanding(setup, 80, rand))).toBeLessThanOrEqual(80)
  })

  it('Stern–Gerlach: z then z always repeats; z then x is 50/50', () => {
    const rand = mulberry32(9)
    let zzRepeat = 0
    let zxUp = 0
    let passed = 0
    for (let i = 0; i < 4000; i++) {
      const zz = runSpin(['z', 'z'], rand)
      if (zz.blockedAt === null) zzRepeat += zz.outcomes[1] === 1 ? 1 : 0
      const zx = runSpin(['z', 'x'], rand)
      if (zx.blockedAt === null) {
        passed++
        if (zx.outcomes[1] === 1) zxUp++
      }
    }
    expect(zzRepeat).toBeGreaterThan(1800)
    expect(zxUp / passed).toBeGreaterThan(0.45)
    expect(zxUp / passed).toBeLessThan(0.55)
  })
})
