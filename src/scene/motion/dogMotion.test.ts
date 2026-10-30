import { Object3D, Vector3 } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, PartRig } from '../modelRig'
import { createDogMotion, dogClock, LEGS, solveLeg } from './dogMotion'

const L1 = 0.05
const L2 = 0.056
const fk = (h: number, k: number) => ({ x: -L1 * Math.sin(h) - L2 * Math.sin(h + k), y: -L1 * Math.cos(h) - L2 * Math.cos(h + k) })

describe('robot dog leg IK', () => {
  it('recovers the standing pose', () => {
    const foot = fk(0.75, -1.5)
    const { h, k } = solveLeg(foot.x, foot.y, L1, L2)
    expect(h).toBeCloseTo(0.75, 4)
    expect(k).toBeCloseTo(-1.5, 4)
  })

  it('reaches targets across the stride', () => {
    for (const dx of [-0.016, 0, 0.016]) {
      for (const dy of [0, 0.018]) {
        const base = fk(0.75, -1.5)
        const { h, k } = solveLeg(base.x + dx, base.y + dy, L1, L2)
        const reached = fk(h, k)
        expect(reached.x).toBeCloseTo(base.x + dx, 5)
        expect(reached.y).toBeCloseTo(base.y + dy, 5)
        expect(k).toBeLessThan(0)
      }
    }
  })
})

describe('robot dog gait', () => {
  // The real dog's standing pose (scripts/build-dog.ts).
  const HIP_PITCH = 0.75
  const KNEE = -1.5
  const STRIDE = 0.032
  const LIFT = 0.018
  const stand = fk(HIP_PITCH, KNEE)
  /** Hips at the body's corners: +x is forward, ±z the sides. */
  const HIPS = { lf: [0.09, 0, 0.05], rf: [0.09, 0, -0.05], lb: [-0.09, 0, 0.05], rb: [-0.09, 0, -0.05] } as const
  const hipOf = (leg: (typeof LEGS)[number]) => new Vector3(...HIPS[leg])
  const kneeOf = (leg: (typeof LEGS)[number]) => hipOf(leg).add(new Vector3(-L1 * Math.sin(HIP_PITCH), -L1 * Math.cos(HIP_PITCH), 0))
  const footOf = (leg: (typeof LEGS)[number]) => hipOf(leg).add(new Vector3(stand.x, stand.y, 0))

  const fakePart = (pose: Vector3): PartRig => ({ mesh: new Object3D(), pose, location: 'model' }) as unknown as PartRig

  let parts: Map<string, PartRig>
  let rig: ModelRig
  let motion: ReturnType<typeof createDogMotion>
  const upper = (leg: string) => parts.get(`upper_leg_${leg}`)!
  const lower = (leg: string) => parts.get(`lower_leg_${leg}`)!
  /** Where a rest-pose point on a leg part has been moved to. */
  const moved = (part: PartRig, rest: Vector3) =>
    rest.clone().sub(part.pose).applyQuaternion(part.mesh.quaternion).add(part.mesh.position)
  /** The foot's position relative to its hip. */
  const foot = (leg: (typeof LEGS)[number]) => moved(lower(leg), footOf(leg)).sub(hipOf(leg))
  /** One frame: the rig puts every part back in its base pose, then the motion moves it. */
  const step = (dt = 1 / 120, active = true) => {
    for (const p of parts.values()) {
      p.mesh.position.copy(p.pose)
      p.mesh.quaternion.identity()
    }
    motion.update(dt, rig, active)
  }

  beforeEach(() => {
    parts = new Map(
      LEGS.flatMap((leg) => [
        // Each part's origin sits partway along its bone, as in a real mesh.
        [`upper_leg_${leg}`, fakePart(hipOf(leg).lerp(kneeOf(leg), 0.4))],
        [`lower_leg_${leg}`, fakePart(kneeOf(leg).lerp(footOf(leg), 0.6))],
      ]),
    )
    const joints = Object.fromEntries(LEGS.map((leg) => [leg, { hip: HIPS[leg], knee: kneeOf(leg).toArray() }]))
    rig = { parts, extras: { joints, thigh: L1, shin: L2, hipPitch: HIP_PITCH, knee: KNEE } } as unknown as ModelRig
    useModel.getState().set({ running: true, tempo: 100, gait: 'trot', explode: 0 })
    motion = createDogMotion(rig)
  })

  it('stands still while stopped, taken apart or outside explore mode', () => {
    for (const [state, active] of [[{ running: false }, true], [{ explode: 0.5 }, true], [{}, false]] as const) {
      useModel.getState().set({ running: true, explode: 0, ...state })
      step(0.1, active)
      expect(dogClock.running).toBe(false)
      for (const p of parts.values()) expect(p.mesh.position.equals(p.pose)).toBe(true)
    }
    useModel.getState().set({ running: true, explode: 0 })
    step()
    expect(dogClock.running).toBe(true)
    motion.dispose()
    expect(dogClock.running).toBe(false)
  })

  it('keeps every hip and knee joined while the legs move', () => {
    for (let i = 0; i < 240; i++) {
      step()
      for (const leg of LEGS) {
        // The thigh turns about the hip, and the shin hangs from wherever the thigh put the knee.
        expect(moved(upper(leg), hipOf(leg)).distanceTo(hipOf(leg)), leg).toBeCloseTo(0, 9)
        expect(moved(lower(leg), kneeOf(leg)).distanceTo(moved(upper(leg), kneeOf(leg))), leg).toBeCloseTo(0, 9)
      }
    }
  })

  for (const gait of ['trot', 'walk'] as const)
    it(`${gait}: feet slide back on the ground, then lift and swing forward`, () => {
      useModel.getState().set({ gait })
      const prev = Object.fromEntries(LEGS.map((leg) => [leg, null as { x: number; swing: boolean } | null]))
      let highest = 0
      for (let i = 0; i < 480; i++) {
        step()
        for (const leg of LEGS) {
          const f = foot(leg)
          const swing = dogClock.swing[leg]
          // Within a stride of the standing spot, never below the ground.
          expect(Math.abs(f.x - stand.x), leg).toBeLessThanOrEqual(STRIDE / 2 + 1e-9)
          expect(f.y - stand.y, leg).toBeGreaterThanOrEqual(-1e-9)
          expect(f.y - stand.y, leg).toBeLessThanOrEqual(LIFT + 1e-9)
          if (!swing) expect(f.y, `${leg} on the ground`).toBeCloseTo(stand.y, 9)
          const p = prev[leg]
          if (p && p.swing === swing) {
            if (swing) expect(f.x, `${leg} swings forward`).toBeGreaterThan(p.x)
            else expect(f.x, `${leg} slides back`).toBeLessThan(p.x)
          }
          prev[leg] = { x: f.x, swing }
          if (swing) highest = Math.max(highest, f.y - stand.y)
        }
      }
      expect(highest).toBeCloseTo(LIFT, 4)
    })

  /** Which legs are in the air, sampled across `cycles` gait cycles at full tempo. */
  const sampleSwing = (cycles: number) => {
    const samples: Record<(typeof LEGS)[number], boolean>[] = []
    // At full tempo a cycle takes 1 / 2.3 s.
    const frames = Math.round((cycles / 2.3) * 1000)
    for (let i = 0; i < frames; i++) {
      step(1 / 1000)
      samples.push({ ...dogClock.swing })
    }
    return samples
  }
  const stanceShare = (samples: Record<string, boolean>[], leg: string) => samples.filter((s) => !s[leg]).length / samples.length

  it('trots with diagonal pairs in step, always two feet down', () => {
    const samples = sampleSwing(3)
    for (const s of samples) {
      expect(s.lf).toBe(s.rb)
      expect(s.rf).toBe(s.lb)
      expect(s.lf && s.rf).toBe(false)
    }
    for (const leg of LEGS) expect(stanceShare(samples, leg), leg).toBeCloseTo(0.55, 2)
  })

  it('walks one leg at a time: left-front, right-back, right-front, left-back', () => {
    useModel.getState().set({ gait: 'walk' })
    const samples = sampleSwing(3)
    const lifts: string[] = []
    samples.forEach((s, i) => {
      expect(LEGS.filter((leg) => s[leg]).length).toBeLessThanOrEqual(1)
      for (const leg of LEGS) if (s[leg] && !samples[i - 1]?.[leg]) lifts.push(leg)
    })
    expect(lifts.slice(0, 8)).toEqual(['rb', 'rf', 'lb', 'lf', 'rb', 'rf', 'lb', 'lf'])
    for (const leg of LEGS) expect(stanceShare(samples, leg), leg).toBeCloseTo(0.75, 2)
  })

  it('steps faster with the tempo', () => {
    const steps = (tempo: number) => {
      useModel.getState().set({ tempo })
      motion = createDogMotion(rig)
      let count = 0
      let was = false
      for (let i = 0; i < 10 * 120; i++) {
        step()
        if (dogClock.swing.lf && !was) count++
        was = dogClock.swing.lf
      }
      return count
    }
    // 0.5 cycles a second at rest tempo, up to 2.3 at full.
    expect(steps(0)).toBe(5)
    expect(steps(100)).toBe(23)
  })

  it('leaves legs lying on the bench alone', () => {
    upper('lf').location = 'bench'
    lower('rb').location = 'bench'
    for (let i = 0; i < 30; i++) step()
    expect(upper('lf').mesh.position.equals(upper('lf').pose)).toBe(true)
    expect(lower('rb').mesh.quaternion.equals(upper('lf').mesh.quaternion)).toBe(true)
    expect(lower('lf').mesh.position.equals(lower('lf').pose)).toBe(false)
  })
})
