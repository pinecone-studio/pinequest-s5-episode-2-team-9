import { describe, expect, it } from 'vitest'
import {
  conductor,
  fieldLines,
  formula,
  LOOP_RADIUS,
  MU0,
  pathField,
  probeField,
  SCENE_M,
  SOLENOID,
  traceFieldLine,
} from './fields'
import { equatorTargets, hopfSpin, linkingNumber, preimage, spinColor } from './hopfion'
import {
  borisStep,
  driftVelocity,
  gyroPeriod,
  gyroradius,
  lorentzForce,
  startPosition,
  startVelocity,
  type LorentzParams,
} from './lorentz'
import { cross, distance, dot, length, normalize, type Vec3 } from './vec'

describe('Biot–Savart', () => {
  const wire = conductor('wire')

  it('a long straight wire gives μ₀I / 2πr', () => {
    for (const r of [0.01, 0.05, 0.12]) {
      const b = length(pathField(wire.path, 10, [r, 0.02, 0]))
      expect(b / formula.wire(10, r)).toBeCloseTo(1, 3)
    }
    // 10 A at 5 cm: 40 μT, close to Earth's own field.
    expect(formula.wire(10, 0.05)).toBeCloseTo(4e-5, 8)
  })

  it('the field circles the wire by the right-hand rule', () => {
    // Current up (+y); at +x the field points along −z, at +z along +x.
    const atX = normalize(pathField(wire.path, 1, [0.05, 0, 0]))
    const atZ = normalize(pathField(wire.path, 1, [0, 0, 0.05]))
    expect(atX[2]).toBeCloseTo(-1, 6)
    expect(atZ[0]).toBeCloseTo(1, 6)
    // And it is perpendicular to both the current and the radius.
    expect(dot(atX, [0, 1, 0])).toBeCloseTo(0, 9)
    expect(dot(atX, [1, 0, 0])).toBeCloseTo(0, 9)
  })

  it('a circular loop gives μ₀I / 2R at its centre, along +y', () => {
    const { path, closed } = conductor('loop')
    const b = pathField(path, 5, [0, 0, 0], closed)
    expect(b[1] / ((MU0 * 5) / (2 * LOOP_RADIUS))).toBeCloseTo(1, 3)
    // And the on-axis formula off-centre.
    const z = 0.04
    expect(pathField(path, 5, [0, z, 0], closed)[1] / formula.loop(5, LOOP_RADIUS, z)).toBeCloseTo(1, 3)
  })

  it('a solenoid matches the finite-solenoid formula on its axis', () => {
    const { path } = conductor('solenoid')
    const { radius, length: len, turns } = SOLENOID
    for (const z of [0, 0.05]) {
      const b = pathField(path, 2, [0, z, 0])[1]
      expect(b / formula.solenoid(2, radius, len, turns, z)).toBeGreaterThan(0.97)
      expect(b / formula.solenoid(2, radius, len, turns, z)).toBeLessThan(1.03)
    }
  })

  it('traced field lines around a wire are closed circles', () => {
    const field = (p: Vec3) => pathField(wire.path, 1, [p[0] * SCENE_M, p[1] * SCENE_M, p[2] * SCENE_M])
    const line = traceFieldLine(field, [0.5, 0, 0], { step: 0.01, maxSteps: 2000, bound: 3 })
    expect(line.closed).toBe(true)
    for (const p of line.points) {
      expect(Math.hypot(p[0], p[2])).toBeCloseTo(0.5, 4)
      expect(p[1]).toBeCloseTo(0, 6)
    }
    // One full turn: about 2π r of path.
    expect(line.points.length * 0.01).toBeCloseTo(Math.PI, 1)
  })

  it('every conductor yields a full set of field lines', () => {
    for (const s of ['wire', 'loop', 'solenoid'] as const) {
      const lines = fieldLines(s)
      expect(lines.length).toBeGreaterThan(10)
      for (const l of lines) expect(l.points.length).toBeGreaterThan(20)
    }
  })
})

describe('Lorentz force and the Boris pusher', () => {
  const base: LorentzParams = { charge: 1, b: 1.5, e: 0, eDir: 'perp', speed: 0.9, pitch: 90 }

  it('the magnetic force is perpendicular to v and B', () => {
    const v: Vec3 = [0.3, 0.4, 0.5]
    const { magnetic } = lorentzForce(base, v)
    expect(dot(magnetic, v)).toBeCloseTo(0, 12)
    expect(dot(magnetic, [0, 1, 0])).toBeCloseTo(0, 12)
  })

  it('conserves speed in a pure magnetic field', () => {
    const x: Vec3 = [0, 0, 0]
    const v: Vec3 = [0.4, 0.3, 0.7]
    const speed = length(v)
    for (let i = 0; i < 50_000; i++) borisStep(x, v, -1, [0, 0, 0], [0.2, 1.7, -0.4], 0.01)
    expect(length(v)).toBeCloseTo(speed, 12)
  })

  it('moves on a circle of the Larmor radius, centred where startPosition puts it', () => {
    const x = startPosition(base)
    const v = startVelocity(base)
    const r = gyroradius(base.speed, base.b)
    const dt = 0.001
    const steps = Math.round(gyroPeriod(base.b) / dt)
    for (let i = 0; i < steps; i++) {
      borisStep(x, v, 1, [0, 0, 0], [0, base.b, 0], dt)
      expect(Math.hypot(x[0], x[2])).toBeCloseTo(r, 3)
    }
    // Back where it started after one cyclotron period.
    expect(distance(x, startPosition(base))).toBeLessThan(0.01)
  })

  it('positive charges gyrate clockwise seen from the tip of B, negative ones anticlockwise', () => {
    for (const charge of [1, -1] as const) {
      const p = { ...base, charge }
      const x = startPosition(p)
      const v = startVelocity(p)
      // Angular momentum about B: negative = clockwise seen from +y.
      const lz = cross(x, v)[1]
      expect(Math.sign(lz)).toBe(-charge)
    }
  })

  it('crossed E and B fields drift at E × B / B², whatever the charge', () => {
    for (const charge of [1, -1] as const) {
      const p: LorentzParams = { ...base, charge, e: 0.3 }
      const drift = driftVelocity(p)
      const x: Vec3 = [0, 0, 0]
      const v = startVelocity(p)
      const dt = 0.002
      const periods = 6
      const steps = Math.round((periods * gyroPeriod(p.b)) / dt)
      for (let i = 0; i < steps; i++) borisStep(x, v, charge, [p.e, 0, 0], [0, p.b, 0], dt)
      const t = steps * dt
      expect(x[2] / t).toBeCloseTo(drift[2], 3)
      expect(drift[2]).toBeCloseTo(0.3 / 1.5, 9)
    }
  })
})

describe('Hopfion', () => {
  it('is a unit spin field, up far away and down on the core ring', () => {
    for (const p of [
      [0.3, -0.2, 0.7],
      [1.5, 1.1, -0.4],
      [0, 0, 0],
    ] as Vec3[])
      expect(length(hopfSpin(...p))).toBeCloseTo(1, 12)
    expect(hopfSpin(400, 300, 200)[2]).toBeCloseTo(1, 4)
    expect(hopfSpin(0, 0, 0)[2]).toBeCloseTo(1, 12)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      expect(hopfSpin(Math.cos(a), Math.sin(a), 0)[2]).toBeCloseTo(-1, 12)
    }
  })

  it('preimage loops really carry the chosen spin direction', () => {
    const m = normalize([0.4, -0.7, -0.3])
    for (const p of preimage(m, 64)) {
      const n = hopfSpin(...p)
      expect(distance(n, m)).toBeLessThan(1e-9)
    }
  })

  it('any two preimage loops link exactly once (Hopf charge 1)', () => {
    const targets = [...equatorTargets(3), normalize([0.2, 0.5, -0.8]) as Vec3]
    const loops = targets.map((m) => preimage(m, 200))
    for (let i = 0; i < loops.length; i++)
      for (let j = i + 1; j < loops.length; j++) expect(linkingNumber(loops[i], loops[j])).toBeCloseTo(1, 2)
  })

  it('precessing the spins turns the whole texture about z', () => {
    // A uniform spin rotation by β about z is the same texture turned by β in space.
    const beta = 0.9
    const c = Math.cos(beta)
    const s = Math.sin(beta)
    const m = normalize([0.5, 0.5, -0.4])
    for (const p of preimage(m, 32, 0)) {
      const q: Vec3 = [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
      expect(distance(hopfSpin(...q, beta), m)).toBeLessThan(1e-9)
    }
    for (const p of preimage(m, 32, beta)) expect(distance(hopfSpin(...p, beta), m)).toBeLessThan(1e-9)
  })

  it('colours up light and down dark', () => {
    const up = spinColor([0, 0, 1])
    const down = spinColor([0, 0, -1])
    expect(Math.min(...up)).toBeGreaterThan(0.8)
    expect(Math.max(...down)).toBeLessThan(0.3)
  })
})

describe('probe', () => {
  it('agrees with the textbook formula for every conductor', () => {
    for (const [source, probe] of [
      ['wire', 0.4],
      ['loop', 0.3],
      ['solenoid', 0],
    ] as const) {
      const { b, textbook } = probeField(source, 12, probe)
      expect(length(b) / textbook).toBeGreaterThan(0.97)
      expect(length(b) / textbook).toBeLessThan(1.03)
    }
  })
})
