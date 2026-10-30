import { Group, Sprite, Vector3 } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translate, useLang } from '../../i18n'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, PartRig } from '../modelRig'
import { ATRIAL, heartClock, VENTRICULAR } from './heartClock'
import { avOpen, createHeartMotion, semilunarOpen } from './heartMotion'
import { motionInfo } from './motionInfo'

const mocks = vi.hoisted(() => ({
  play: vi.fn<(name: string) => void>(),
  labels: [] as { text: string }[],
}))

vi.mock('../../audio/sfx', () => ({ play: mocks.play }))
// Labels draw on a canvas, which node doesn't have; keep the text they were given.
vi.mock('./holoShapes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./holoShapes')>()),
  Label: class {
    sprite = new Sprite()
    text = ''
    constructor() {
      mocks.labels.push(this)
    }
    set(text: string) {
      this.text = text
    }
    dispose() {
      this.sprite.removeFromParent()
    }
  },
}))

const beat = Array.from({ length: 1000 }, (_, i) => i / 1000)

describe('valve timing', () => {
  it('never opens both sets of valves at once', () => {
    for (const t of beat) expect(avOpen(t) && semilunarOpen(t), `t = ${t}`).toBe(false)
  })

  it('shuts all four valves while the ventricles build and lose pressure', () => {
    for (const t of [VENTRICULAR[0] + 0.01, VENTRICULAR[0] + 0.03, VENTRICULAR[1] + 0.01, VENTRICULAR[1] + 0.03]) {
      expect(avOpen(t), `t = ${t}`).toBe(false)
      expect(semilunarOpen(t), `t = ${t}`).toBe(false)
    }
  })

  it('lets the atria fill the ventricles and the ventricles empty into the arteries', () => {
    for (const t of beat) {
      if (t >= ATRIAL[0] && t < ATRIAL[1]) expect(avOpen(t), `atrial kick at ${t}`).toBe(true)
      if (t > VENTRICULAR[1] + 0.05) expect(avOpen(t), `diastole at ${t}`).toBe(true)
    }
    expect(semilunarOpen((VENTRICULAR[0] + VENTRICULAR[1]) / 2)).toBe(true)
  })
})

describe('heart motion', () => {
  const PARTS = [
    'right_atrium',
    'left_atrium',
    'right_ventricle',
    'left_ventricle',
    'tricuspid_valve',
    'mitral_valve',
    'pulmonary_valve',
    'aortic_valve',
    'septum',
    'aorta',
    'pulmonary_trunk',
  ]

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
  const part = (id: string) => parts.get(id)!
  /** One frame: the rig puts every part back in its base pose, then the motion moves it. */
  const step = (motion: ReturnType<typeof createHeartMotion>, dt: number, active = true) => {
    for (const p of parts.values()) {
      p.mesh.scale.set(1, 1, 1)
      p.holo.uniforms.uHighlight.value = 0
    }
    motion.update(dt, rig, active)
  }
  const group = () => rig.inner.children[0]

  beforeEach(() => {
    parts = new Map(PARTS.map((id) => [id, fakePart()]))
    rig = { inner: new Group(), parts } as unknown as ModelRig
    heartClock.t = 0
    heartClock.beats = 0
    mocks.play.mockClear()
    mocks.labels.length = 0
    useLang.getState().setLang('en')
    // One beat per second keeps the clock in step with dt.
    useModel.getState().set({ running: true, tempo: 60, explode: 0, slowMotion: false, scale: 1 })
  })

  it('stays hidden and still while stopped or outside explore mode', () => {
    const motion = createHeartMotion(rig)
    step(motion, 0.3, false)
    expect(heartClock.running).toBe(false)
    expect(group().visible).toBe(false)
    useModel.getState().set({ running: false })
    step(motion, 0.3)
    expect(heartClock.t).toBe(0)
    expect(part('left_ventricle').mesh.scale.x).toBe(1)
    motion.dispose()
  })

  it('hides the circulation while the heart is taken apart, but keeps beating', () => {
    useModel.getState().set({ explode: 0.5 })
    const motion = createHeartMotion(rig)
    step(motion, 0.3)
    expect(group().visible).toBe(false)
    expect(heartClock.t).toBeCloseTo(0.3, 9)
    expect(part('left_ventricle').mesh.scale.x).toBeLessThan(1)
    motion.dispose()
  })

  it('squeezes the atria first, then the ventricles', () => {
    const motion = createHeartMotion(rig)
    step(motion, (ATRIAL[0] + ATRIAL[1]) / 2)
    expect(part('right_atrium').mesh.scale.x).toBeLessThan(1)
    expect(part('right_ventricle').mesh.scale.x).toBe(1)
    // The AV valves stand open so the atria can top up the ventricles.
    expect(part('tricuspid_valve').holo.uniforms.uHighlight.value).toBeGreaterThan(0)
    expect(part('aortic_valve').holo.uniforms.uHighlight.value).toBe(0)

    step(motion, (VENTRICULAR[0] + VENTRICULAR[1]) / 2 - heartClock.t)
    expect(part('right_atrium').mesh.scale.x).toBe(1)
    expect(part('left_ventricle').mesh.scale.x).toBeLessThan(1)
    expect(part('septum').mesh.scale.x).toBeLessThan(1)
    // The great arteries swell as blood is pushed into them.
    expect(part('aorta').mesh.scale.x).toBeGreaterThan(1)
    expect(part('mitral_valve').holo.uniforms.uHighlight.value).toBe(0)
    expect(part('aortic_valve').holo.uniforms.uHighlight.value).toBeGreaterThan(0)
    motion.dispose()
  })

  it('plays lub as the AV valves shut and dub as the semilunar valves shut, once a beat', () => {
    const motion = createHeartMotion(rig)
    for (let i = 0; i < 3 * 50; i++) step(motion, 0.02)
    expect(heartClock.beats).toBe(3)
    expect(mocks.play.mock.calls.map(([name]) => name)).toEqual(['lub', 'dub', 'lub', 'dub', 'lub', 'dub'])
    motion.dispose()
  })

  it('still plays lub when a frame wraps into the next beat past the mark', () => {
    const motion = createHeartMotion(rig)
    step(motion, 0.9)
    mocks.play.mockClear()
    step(motion, 0.3)
    expect(heartClock.t).toBeCloseTo(0.2, 9)
    expect(mocks.play.mock.calls.map(([name]) => name)).toEqual(['lub'])
    motion.dispose()
  })

  it('beats in time with the tempo and slows down in slow motion', () => {
    useModel.getState().set({ tempo: 120 })
    const motion = createHeartMotion(rig)
    step(motion, 0.25)
    expect(heartClock.t).toBeCloseTo(0.5, 9)
    expect(heartClock.bpm).toBe(120)
    useModel.getState().set({ slowMotion: true })
    step(motion, 1)
    expect(heartClock.t).toBeCloseTo(0, 9)
    expect(heartClock.beats).toBe(1)
    motion.dispose()
  })

  it('shrinks the model to fit the circulation and gives the zoom back on stop', () => {
    useModel.getState().set({ scale: 1.4 })
    const motion = createHeartMotion(rig)
    step(motion, 0.1)
    expect(useModel.getState().scale).toBe(0.8)
    useModel.getState().set({ running: false })
    step(motion, 0.1)
    expect(useModel.getState().scale).toBe(1.4)
    motion.dispose()
  })

  it("keeps the user's own zoom on stop", () => {
    const motion = createHeartMotion(rig)
    step(motion, 0.1)
    useModel.getState().set({ scale: 1.1 })
    useModel.getState().set({ running: false })
    step(motion, 0.1)
    expect(useModel.getState().scale).toBe(1.1)

    // Already small enough: left alone.
    useModel.getState().set({ running: true, scale: 0.6 })
    step(motion, 0.1)
    expect(useModel.getState().scale).toBe(0.6)
    motion.dispose()
  })

  it('carries blood around the double loop, only through open valves, and counts each lap', () => {
    useModel.getState().set({ tempo: 72 })
    const motion = createHeartMotion(rig)
    /** Each region the tracer passes through, with the oxygen readings taken there. */
    const visits: { where: string; oxygen: number[] }[] = []
    for (let i = 0; i < 2000 && motionInfo.laps < 1; i++) {
      step(motion, 0.05)
      const where = motionInfo.where
      if (where !== visits.at(-1)?.where) {
        // Blood moves into a ventricle only through an open AV valve, and out of it only
        // through an open semilunar valve.
        if (where === 'rightVentricle' || where === 'leftVentricle') expect(avOpen(heartClock.t), where).toBe(true)
        if (where === 'pulmonaryArtery' || (where === 'aorta' && visits.at(-1)?.where === 'leftVentricle'))
          expect(semilunarOpen(heartClock.t), where).toBe(true)
        visits.push({ where, oxygen: [] })
      }
      visits.at(-1)!.oxygen.push(motionInfo.values.oxygen)
      expect(motionInfo.progress).toBeGreaterThanOrEqual(0)
      expect(motionInfo.progress).toBeLessThan(1)
    }

    const half = ['rightAtrium', 'rightVentricle', 'pulmonaryArtery', 'lungs', 'pulmonaryVeins', 'leftAtrium', 'leftVentricle', 'aorta']
    expect(motionInfo.laps).toBe(1)
    expect(visits.map((v) => v.where)).toEqual(['venaCava', ...half, 'upperBody', 'venaCava', ...half, 'lowerBody', 'venaCava'])

    // Oxygen-poor on the right, oxygen-rich on the left; it changes over in the capillaries.
    const blue = ['venaCava', 'rightAtrium', 'rightVentricle', 'pulmonaryArtery']
    const red = ['pulmonaryVeins', 'leftAtrium', 'leftVentricle', 'aorta']
    for (const { where, oxygen } of visits) {
      if (blue.includes(where)) expect(new Set(oxygen), where).toEqual(new Set([75]))
      if (red.includes(where)) expect(new Set(oxygen), where).toEqual(new Set([98]))
      if (where === 'lungs') {
        expect(oxygen[0]).toBeLessThan(80)
        expect(oxygen.at(-1)).toBeGreaterThan(95)
        for (let i = 1; i < oxygen.length; i++) expect(oxygen[i]).toBeGreaterThanOrEqual(oxygen[i - 1])
      }
      if (where === 'upperBody' || where === 'lowerBody') {
        expect(oxygen.at(-1)).toBeLessThan(78)
        for (let i = 1; i < oxygen.length; i++) expect(oxygen[i]).toBeLessThanOrEqual(oxygen[i - 1])
      }
    }
    motion.dispose()
  })

  it('labels the lungs and body in the current language', () => {
    const motion = createHeartMotion(rig)
    const texts = () => mocks.labels.map((l) => l.text)
    expect(texts()).toEqual([
      translate('en', 'circulation.label.lungs'),
      translate('en', 'circulation.label.upperBody'),
      translate('en', 'circulation.label.lowerBody'),
    ])
    useLang.getState().setLang('mn')
    expect(texts()).toEqual([
      translate('mn', 'circulation.label.lungs'),
      translate('mn', 'circulation.label.upperBody'),
      translate('mn', 'circulation.label.lowerBody'),
    ])
    motion.dispose()
    // Disposed motions stop listening.
    useLang.getState().setLang('en')
    expect(texts()[0]).toBe(translate('mn', 'circulation.label.lungs'))
  })

  it('removes everything it added and clears its readouts on dispose', () => {
    const motion = createHeartMotion(rig)
    for (let i = 0; i < 20; i++) step(motion, 0.05)
    expect(rig.inner.children).toHaveLength(1)
    expect(motionInfo.where).not.toBe('')
    motion.dispose()
    expect(rig.inner.children).toHaveLength(0)
    expect(motionInfo).toMatchObject({ where: '', laps: 0, progress: 0, values: {} })
  })
})
