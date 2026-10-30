import { BoxGeometry, Group, Mesh, Vector3 } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { useModel, type BrainScenario } from '../../lab/modelStore'
import { brain } from '../../models/brain/definition'
import type { ModelRig, PartRig } from '../modelRig'
import { createBrainMotion, SCENARIOS } from './brainMotion'
import { motionInfo } from './motionInfo'

const PART_IDS = brain.parts.map((p) => p.id)
/** Where each signal begins: the sense organ (or, for touch, the hand's nerve entering the spinal cord). */
const ORIGINS: Record<BrainScenario, string[]> = { see: ['eyeL', 'eyeR'], smell: ['nose'], touch: ['spinal'] }
/** Seconds per step at 100% speed, and the pause before a scenario starts again. */
const STEP = 2.8
const PAUSE = 1.2

describe('brain scenarios', () => {
  it('only light up parts the brain model has', () => {
    for (const steps of Object.values(SCENARIOS))
      for (const step of steps) for (const id of step.glow) expect(PART_IDS, id).toContain(id)
  })

  it('carry each signal on from where an earlier one arrived', () => {
    for (const [name, steps] of Object.entries(SCENARIOS) as [BrainScenario, (typeof SCENARIOS)['see']][]) {
      const reached = new Set<string>(ORIGINS[name])
      for (const [i, step] of steps.entries())
        for (const path of step.paths) {
          expect(path.length, `${name}.${i}`).toBeGreaterThanOrEqual(2)
          expect(reached, `${name}.${i} starts at ${path[0]}`).toContain(path[0])
          for (const anchor of path) reached.add(anchor)
        }
    }
  })

  it('crosses the eyes at the chiasm on the way to the thalamus', () => {
    const [first] = SCENARIOS.see
    for (const path of first.paths) {
      expect(path).toContain('chiasm')
      expect(path.at(-1)).toMatch(/^lgn/)
    }
  })

  it('sends smell straight to the limbic system, with no stop in the thalamus', () => {
    for (const step of SCENARIOS.smell) for (const path of step.paths) expect(path).not.toContain('thalamus')
  })

  it('ends seeing and touching with a command down the spinal cord', () => {
    for (const name of ['see', 'touch'] as const)
      expect(SCENARIOS[name].some((s) => s.paths.some((p) => p[0] === 'motor' && p.at(-1) === 'spinal')), name).toBe(true)
  })
})

describe('brain motion', () => {
  const fakePart = (i: number): PartRig => {
    const holo = { uniforms: { uHighlight: { value: 0 }, uIntensity: { value: 1 } } }
    // Spread the parts out a little; the motion measures its anchor points from their shapes.
    const mesh = new Mesh(new BoxGeometry(0.02, 0.02, 0.02))
    mesh.material = holo as never
    return {
      def: { color: '#ffffff' },
      mesh,
      holo,
      reals: [],
      home: new Vector3(Math.cos(i) * 0.04, Math.sin(i) * 0.04, (i % 5) * 0.01),
      radius: 0.02,
      location: 'model',
    } as unknown as PartRig
  }

  let parts: Map<string, PartRig>
  let rig: ModelRig
  const glow = (id: string) => parts.get(id)!.holo.uniforms.uHighlight.value
  /** One frame: the rig puts every part back in its base look, then the motion lights it. */
  const step = (motion: ReturnType<typeof createBrainMotion>, dt: number, active = true) => {
    for (const p of parts.values()) {
      p.holo.uniforms.uHighlight.value = 0
      p.holo.uniforms.uIntensity.value = 1
    }
    motion.update(dt, rig, active)
  }
  const group = () => rig.inner.children[0]

  beforeEach(() => {
    parts = new Map(PART_IDS.map((id, i) => [id, fakePart(i)]))
    rig = { inner: new Group(), parts } as unknown as ModelRig
    // 100% speed: one second of motion per second.
    useModel.getState().set({ running: true, tempo: 100, explode: 0, slowMotion: false, brainScenario: 'see' })
  })

  it('stays hidden and quiet while stopped or outside explore mode', () => {
    const motion = createBrainMotion(rig)
    step(motion, 1, false)
    expect(group().visible).toBe(false)
    useModel.getState().set({ running: false })
    step(motion, 1)
    expect(motionInfo.stage).toBe('')
    expect(PART_IDS.every((id) => glow(id) === 0)).toBe(true)
    motion.dispose()
  })

  it('walks through the steps, pauses, and starts again', () => {
    const motion = createBrainMotion(rig)
    const steps = SCENARIOS.see.length
    step(motion, STEP / 2)
    expect(group().visible).toBe(true)
    expect(motionInfo.stage).toBe('see.0')
    expect(motionInfo.values).toEqual({ step: 1, steps })
    step(motion, STEP)
    expect(motionInfo.stage).toBe('see.1')
    expect(motionInfo.values.step).toBe(2)
    // Just past the last step, inside the pause.
    step(motion, STEP * (steps - 1.5) + 0.1)
    expect(motionInfo.stage).toBe('see.done')
    expect(motionInfo.values.step).toBe(steps)
    step(motion, PAUSE)
    expect(motionInfo.stage).toBe('see.0')
    motion.dispose()
  })

  it('lights each region as the signal arrives and leaves the chain faintly lit', () => {
    const motion = createBrainMotion(rig)
    // Early in the first step the signal is still on its way.
    step(motion, 0.2 * STEP)
    expect(glow('thalamus')).toBe(0)
    // Then the thalamus lights up fully, while the visual cortex waits its turn.
    step(motion, 0.6 * STEP)
    expect(glow('thalamus')).toBeCloseTo(1.1, 9)
    expect(glow('occipital_lobe_left')).toBe(0)
    // Next step: the visual cortex takes over and the thalamus stays faintly lit.
    step(motion, STEP)
    expect(glow('occipital_lobe_left')).toBeGreaterThan(0)
    expect(glow('thalamus')).toBeCloseTo(0.3, 9)
    // Dimmed to glass, so the signals inside show.
    expect(parts.get('cerebellum')!.holo.uniforms.uIntensity.value).toBeCloseTo(0.3, 9)
    motion.dispose()
  })

  it('shows the whole chain at the end and clears it when the scenario starts again', () => {
    const motion = createBrainMotion(rig)
    for (let i = 0; i < SCENARIOS.see.length * 10 + 1; i++) step(motion, STEP / 10)
    expect(motionInfo.stage).toBe('see.done')
    for (const id of new Set(SCENARIOS.see.flatMap((s) => s.glow))) expect(glow(id), id).toBeCloseTo(0.3, 9)
    step(motion, PAUSE)
    expect(motionInfo.stage).toBe('see.0')
    expect(PART_IDS.every((id) => glow(id) === 0)).toBe(true)
    motion.dispose()
  })

  it('restarts from the first step when the scenario changes', () => {
    const motion = createBrainMotion(rig)
    step(motion, 2.5 * STEP)
    expect(motionInfo.stage).toBe('see.2')
    useModel.getState().set({ brainScenario: 'smell' })
    step(motion, 0.1)
    expect(motionInfo.stage).toBe('smell.0')
    expect(motionInfo.values).toEqual({ step: 1, steps: SCENARIOS.smell.length })
    expect(glow('thalamus')).toBe(0)
    motion.dispose()
  })

  it('restarts from the first step after being stopped', () => {
    const motion = createBrainMotion(rig)
    step(motion, 1.5 * STEP)
    useModel.getState().set({ running: false })
    step(motion, 0.1)
    useModel.getState().set({ running: true })
    step(motion, 0.1)
    expect(motionInfo.stage).toBe('see.0')
    motion.dispose()
  })

  it('follows the speed setting, with slow motion and a floor', () => {
    useModel.getState().set({ tempo: 50 })
    const motion = createBrainMotion(rig)
    step(motion, 1.5 * STEP)
    expect(motionInfo.stage).toBe('see.0')
    step(motion, 0.6 * STEP)
    expect(motionInfo.stage).toBe('see.1')

    useModel.getState().set({ brainScenario: 'touch', tempo: 100, slowMotion: true })
    step(motion, 3.9 * STEP)
    expect(motionInfo.stage).toBe('touch.0')
    step(motion, 0.2 * STEP)
    expect(motionInfo.stage).toBe('touch.1')

    // Never slower than 10%.
    useModel.getState().set({ brainScenario: 'smell', tempo: 1, slowMotion: false })
    step(motion, 9.9 * STEP)
    expect(motionInfo.stage).toBe('smell.0')
    step(motion, 0.2 * STEP)
    expect(motionInfo.stage).toBe('smell.1')
    motion.dispose()
  })

  it('hides the signals while the brain is taken apart, but keeps going', () => {
    useModel.getState().set({ explode: 0.5 })
    const motion = createBrainMotion(rig)
    step(motion, 1.5 * STEP)
    expect(group().visible).toBe(false)
    expect(motionInfo.stage).toBe('see.1')
    // Not dimmed to glass while hidden.
    expect(parts.get('cerebellum')!.holo.uniforms.uIntensity.value).toBe(1)
    motion.dispose()
  })

  it('removes everything it added and clears its readouts on dispose', () => {
    const motion = createBrainMotion(rig)
    step(motion, 1)
    expect(rig.inner.children).toHaveLength(1)
    motion.dispose()
    expect(rig.inner.children).toHaveLength(0)
    expect(motionInfo).toMatchObject({ stage: '', values: {} })
  })
})
