import { Group, Vector3 } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { useModel } from '../../lab/modelStore'
import airways from '../../models/lungs/airways.json'
import type { ModelRig, PartRig } from '../modelRig'
import { BREATH_DEPTH, breathFlow, breathVolume, createLungMotion, INSPIRATION, lungClock } from './lungMotion'
import { motionInfo } from './motionInfo'

describe('breath curve', () => {
  it('starts and ends at rest and peaks when inspiration ends', () => {
    expect(breathVolume(0)).toBeCloseTo(0, 9)
    expect(breathVolume(INSPIRATION)).toBeCloseTo(1, 9)
    expect(breathVolume(1)).toBeCloseTo(0, 9)
    // No jump where inspiration hands over to recoil.
    expect(breathVolume(INSPIRATION - 1e-9)).toBeCloseTo(breathVolume(INSPIRATION), 6)
  })

  it('rises through inspiration and falls through expiration', () => {
    const ts = Array.from({ length: 101 }, (_, i) => i / 100)
    for (let i = 1; i < ts.length; i++) {
      const [a, b] = [breathVolume(ts[i - 1]), breathVolume(ts[i])]
      if (ts[i] <= INSPIRATION) expect(b).toBeGreaterThan(a)
      else expect(b).toBeLessThan(a)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    }
  })

  it('has flow equal to the slope of volume', () => {
    const h = 1e-6
    for (const t of [0.05, 0.2, 0.35, 0.45, 0.6, 0.8, 0.95]) {
      const slope = (breathVolume(t + h) - breathVolume(t - h)) / (2 * h)
      expect(breathFlow(t)).toBeCloseTo(slope, 4)
    }
  })

  it('breathes out passively: fastest at first, then tailing off', () => {
    expect(breathFlow(INSPIRATION / 2)).toBeGreaterThan(0)
    const out = [0.41, 0.5, 0.7, 0.99].map(breathFlow)
    for (const f of out) expect(f).toBeLessThan(0)
    for (let i = 1; i < out.length; i++) expect(Math.abs(out[i])).toBeLessThan(Math.abs(out[i - 1]))
    // Recoil starts faster than inspiration ever gets.
    expect(Math.abs(out[0])).toBeGreaterThan(breathFlow(INSPIRATION / 2))
  })
})

describe('airway tree', () => {
  const segments = (airways as unknown as { segments: { id: string; points: number[][]; radius: number[]; next: string[] }[] })
    .segments
  const byId = new Map(segments.map((s) => [s.id, s]))

  it('is one tree rooted at the trachea, so air can flow back out the way it came', () => {
    expect(byId.size, 'unique ids').toBe(segments.length)
    const parents = new Map<string, number>()
    for (const s of segments)
      for (const n of s.next) {
        expect(byId.has(n), `${s.id} → ${n} exists`).toBe(true)
        parents.set(n, (parents.get(n) ?? 0) + 1)
      }
    for (const s of segments) expect(parents.get(s.id) ?? 0, s.id).toBe(s.id === 'trachea' ? 0 : 1)
  })

  it('joins every branch to its parent without a gap', () => {
    for (const s of segments) {
      expect(s.radius.length, `${s.id} has a radius per point`).toBe(s.points.length)
      for (const n of s.next) {
        const a = s.points[s.points.length - 1]
        const b = byId.get(n)!.points[0]
        expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), `${s.id} → ${n}`).toBeLessThan(1e-9)
      }
    }
  })
})

describe('lung motion', () => {
  const LOBES = ['right_upper_lobe', 'right_middle_lobe', 'right_lower_lobe', 'left_upper_lobe', 'left_lower_lobe']

  const fakePart = (): PartRig => {
    const holo = { uniforms: { uHighlight: { value: 0 }, uIntensity: { value: 1 } } }
    return {
      def: { color: '#ffffff' },
      mesh: { scale: new Vector3(1, 1, 1), position: new Vector3(), material: holo },
      holo,
      reals: [],
      radius: 1,
      location: 'model',
    } as unknown as PartRig
  }

  let parts: Map<string, PartRig>
  let rig: ModelRig
  /** One frame: the rig puts every part back in its base pose, then the motion moves it. */
  const step = (motion: ReturnType<typeof createLungMotion>, dt: number, active = true) => {
    for (const p of parts.values()) {
      p.mesh.scale.set(1, 1, 1)
      p.mesh.position.set(0, 0, 0)
      p.holo.uniforms.uHighlight.value = 0
    }
    motion.update(dt, rig, active)
  }

  beforeEach(() => {
    parts = new Map([...LOBES, 'diaphragm', 'trachea'].map((id) => [id, fakePart()]))
    rig = { inner: new Group(), parts, realistic: false } as unknown as ModelRig
    lungClock.t = 0
    lungClock.breaths = 0
    // One breath per second keeps the clock in step with dt.
    useModel.getState().set({ running: true, tempo: 60, explode: 0, slowMotion: false, breathDepth: 'quiet' })
  })

  it('stays still while stopped or outside explore mode', () => {
    const motion = createLungMotion(rig)
    step(motion, 0.2, false)
    expect(lungClock.running).toBe(false)
    useModel.getState().set({ running: false })
    step(motion, 0.2)
    expect(lungClock.t).toBe(0)
    expect(parts.get('right_lower_lobe')!.mesh.scale.y).toBe(1)
    expect(parts.get('diaphragm')!.mesh.position.y).toBe(0)
    motion.dispose()
  })

  it('breathes in: the lungs fill from the base and the diaphragm descends', () => {
    const motion = createLungMotion(rig)
    step(motion, 0.2)
    expect(motionInfo.stage).toBe('inhale')
    expect(motionInfo.values.volume).toBeCloseTo(BREATH_DEPTH.quiet.volume / 2, 6)
    expect(motionInfo.values.flow).toBeGreaterThan(0)

    const lower = parts.get('right_lower_lobe')!.mesh
    const upper = parts.get('right_upper_lobe')!.mesh
    expect(lower.scale.y).toBeGreaterThan(upper.scale.y)
    expect(upper.scale.y).toBeGreaterThan(1)
    // The apex stays put, so the lungs grow downward, and each side grows outward.
    expect(lower.position.y).toBeLessThan(0)
    expect(lower.position.x).toBeLessThan(0)
    expect(parts.get('left_lower_lobe')!.mesh.position.x).toBeGreaterThan(0)

    const diaphragm = parts.get('diaphragm')!
    expect(diaphragm.mesh.position.y).toBeLessThan(0)
    expect(diaphragm.holo.uniforms.uHighlight.value).toBeGreaterThan(0)
    expect(parts.get('trachea')!.mesh.position.y).toBeLessThan(0)
    motion.dispose()
  })

  it('reaches textbook resting values at the top of a quiet breath', () => {
    const motion = createLungMotion(rig)
    step(motion, INSPIRATION)
    expect(motionInfo.values.volume).toBeCloseTo(500, 6)
    expect(motionInfo.values.diaphragm).toBeCloseTo(1.5, 6)
    // Pleural pressure falls from -5 to about -8 cmH2O; the recoil flow nudges it back up.
    expect(motionInfo.values.pleural).toBeLessThan(-5)
    expect(motionInfo.values.pleural + 0.8 * motionInfo.values.flow).toBeCloseTo(-8, 6)
    motion.dispose()
  })

  it('breathes out with the diaphragm relaxing and air leaving', () => {
    const motion = createLungMotion(rig)
    step(motion, 0.7)
    expect(motionInfo.stage).toBe('exhale')
    expect(motionInfo.values.flow).toBeLessThan(0)
    // Breathing out pushes alveolar pressure above the air outside.
    expect(motionInfo.values.alveolar).toBeGreaterThan(0)
    expect(parts.get('diaphragm')!.holo.uniforms.uHighlight.value).toBe(0)
    motion.dispose()
  })

  it('moves six times more air on a deep breath', () => {
    useModel.getState().set({ breathDepth: 'deep' })
    const motion = createLungMotion(rig)
    step(motion, INSPIRATION)
    expect(motionInfo.values.volume).toBeCloseTo(3000, 6)
    expect(motionInfo.values.diaphragm).toBeCloseTo(6, 6)
    motion.dispose()
  })

  it('counts whole breaths and slows down in slow motion', () => {
    const motion = createLungMotion(rig)
    for (let i = 0; i < 10; i++) step(motion, 0.25)
    expect(lungClock.breaths).toBe(2)
    expect(motionInfo.laps).toBe(2)
    expect(motionInfo.progress).toBeCloseTo(0.5, 9)

    useModel.getState().set({ slowMotion: true })
    step(motion, 1)
    expect(lungClock.t).toBeCloseTo(0.75, 9)
    motion.dispose()
  })

  it('clears its readouts when stopped or disposed', () => {
    const motion = createLungMotion(rig)
    step(motion, 0.2)
    useModel.getState().set({ running: false })
    step(motion, 0.2)
    expect(motionInfo.stage).toBe('')
    expect(motionInfo.values).toEqual({})

    useModel.getState().set({ running: true })
    step(motion, 0.2)
    motion.dispose()
    expect(lungClock.running).toBe(false)
    expect(motionInfo.stage).toBe('')
  })
})
