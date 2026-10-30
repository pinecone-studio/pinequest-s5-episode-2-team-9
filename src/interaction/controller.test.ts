import { PerspectiveCamera, Quaternion, Vector3, type Raycaster } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tuning } from '../input/tuning'
import { PinchPair } from '../input/twoHands'
import { useLab } from '../lab/labStore'
import { useModel } from '../lab/modelStore'
import type { ModelDefinition } from '../models/ModelDefinition'
import type { ModelRig, PartLocation } from '../scene/modelRig'
import { InteractionController } from './controller'
import { gestureHud } from './gestureHud'
import type { HubEvent, Pointer, PointerHub } from './pointerHub'

const mocks = vi.hoisted(() => ({ play: vi.fn<(name: string) => void>() }))
vi.mock('../audio/sfx', () => ({ play: mocks.play }))

const W = 1000
const H = 800
const FRAME = 1 / 60
/** The model's centre and radius on screen (px). */
const CENTER = { x: 500, y: 400 }
const RADIUS = 200

/** A small model: a base, two parts that go on it in order, and a part that splits into pieces. */
const MODEL: ModelDefinition = {
  id: 'heart',
  slug: 'test',
  url: '/models/test.glb',
  groups: ['body'],
  parts: [
    { id: 'base', group: 'body', color: '#fff', dependsOn: [] },
    { id: 'lid', group: 'body', color: '#fff', dependsOn: ['base'] },
    { id: 'knob', group: 'body', color: '#fff', dependsOn: ['lid'] },
    { id: 'lobe', group: 'body', color: '#fff', dependsOn: ['base'], pieces: [{ id: 'a' }, { id: 'b', pieces: [{ id: 'b1' }] }] },
  ],
  baseParts: ['base'],
  cutaway: false,
  edges: false,
  glow: 1,
  initialRotation: [0, 0, 0],
  accent: '#fff',
  sources: [],
  looks: { default: 'steel' },
}

const camera = new PerspectiveCamera(40, W / H, 0.1, 100)
camera.position.set(0, 0, 4)
camera.updateMatrixWorld()

const toScreen = (world: Vector3) => {
  const p = world.clone().project(camera)
  return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H }
}
const rayScreen = (ray: Raycaster) => toScreen(ray.ray.at(1, new Vector3()))

interface Target {
  id: string
  x: number
  y: number
  /** Where the part starts; 'piece' targets are pieces of the studied part. */
  where: PartLocation | 'piece'
}

/** A stand-in rig: parts are spots on screen, picked within 30 px. */
function fakeRig(targets: Target[]) {
  const location = new Map(targets.filter((t) => t.where !== 'piece').map((t) => [t.id, t.where as PartLocation]))
  const carried = new Map<string, Vector3>()
  /** Each part's slot: a little above the centre of the model. */
  const slot = new Vector3(0.3, 0.4, 0.2)
  const under = (ray: Raycaster, ok: (t: Target) => boolean) => {
    const s = rayScreen(ray)
    return targets.find((t) => ok(t) && Math.hypot(t.x - s.x, t.y - s.y) < 30)?.id ?? null
  }
  const rig = {
    rotation: new Quaternion(),
    location,
    carried,
    pick: vi.fn((ray: Raycaster, locations: PartLocation[] = ['model', 'bench']) =>
      under(ray, (t) => t.where !== 'piece' && locations.includes(location.get(t.id)!)),
    ),
    pickPiece: vi.fn((ray: Raycaster) => under(ray, (t) => t.where === 'piece')),
    relocate: vi.fn((id: string, where: PartLocation) => void location.set(id, where)),
    carryTo: vi.fn((id: string, world: Vector3) => void carried.set(id, world.clone())),
    flash: vi.fn(),
    // Same maths as ModelRig.rotateBy: screen-space axes.
    rotateBy: vi.fn((yaw: number, pitch: number, roll = 0) => {
      rig.rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw))
      rig.rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch))
      if (roll) rig.rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll))
      rig.rotation.normalize()
    }),
    slotWorld: (_id: string, out = new Vector3()) => out.copy(slot),
    partWorld: (id: string, out = new Vector3()) => out.copy(carried.get(id) ?? new Vector3(0, -1.2, 0)),
    toScreen: (world: Vector3) => toScreen(world),
    screenCenter: () => CENTER,
    screenRadius: () => RADIUS,
  }
  return rig
}

/** A stand-in pointer hub: the test moves pointers and sends their events. */
function fakeHub() {
  const listeners = new Set<(e: HubEvent) => void>()
  const pointers = new Map<string, Pointer>()
  return {
    pointers,
    subscribe: (l: (e: HubEvent) => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    scenePointers: () => [...pointers.values()],
    emit: (e: HubEvent) => listeners.forEach((l) => l(e)),
  }
}

let rig: ReturnType<typeof fakeRig>
let hub: ReturnType<typeof fakeHub>
let controller: InteractionController
let detach: () => void
const store = () => useModel.getState()
const sounds = () => mocks.play.mock.calls.map(([name]) => name)

function setup(targets: Target[] = []) {
  rig = fakeRig(targets)
  hub = fakeHub()
  controller = new InteractionController(rig as unknown as ModelRig, hub as unknown as PointerHub, camera, () => ({ width: W, height: H }))
  detach = controller.attach()
}

const pointer = (id: string, x: number, y: number): Pointer => ({
  id,
  kind: id.startsWith('hand') ? 'hand' : 'mouse',
  x,
  y,
  pressed: false,
  progress: 0,
  fist: 0,
  overHud: false,
  captured: false,
  coasting: false,
  bloom: null,
})
/** Shows a pointer (not pressed) at a spot. */
const hover = (id: string, x: number, y: number) => {
  const p = hub.pointers.get(id) ?? pointer(id, x, y)
  Object.assign(p, { x, y })
  hub.pointers.set(id, p)
  return p
}
const press = (id: string, x: number, y: number) => {
  const p = hover(id, x, y)
  p.pressed = true
  hub.emit({ type: 'down', pointer: p })
}
const move = (id: string, x: number, y: number) => void Object.assign(hub.pointers.get(id)!, { x, y })
const release = (id: string, cancel = false) => {
  const p = hub.pointers.get(id)!
  p.pressed = false
  hub.emit({ type: cancel ? 'cancel' : 'up', pointer: p })
}
/** One frame of the scene, with the clock moving on. */
const frame = (dt = FRAME) => {
  vi.advanceTimersByTime(dt * 1000)
  controller.update(dt)
}
const frames = (n: number) => {
  for (let i = 0; i < n; i++) frame()
}
/** Moves a pointer in even steps over `n` frames. */
const drag = (id: string, x: number, y: number, n = 10) => {
  const p = hub.pointers.get(id)!
  const [x0, y0] = [p.x, p.y]
  for (let i = 1; i <= n; i++) {
    move(id, x0 + ((x - x0) * i) / n, y0 + ((y - y0) * i) / n)
    frame()
  }
}
const angle = (q: Quaternion) => q.angleTo(new Quaternion())

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'Date'] })
  mocks.play.mockClear()
  useModel.getState().load(MODEL)
  useLab.getState().set({ settingsOpen: false, creditsOpen: false, tipsOpen: false })
})

afterEach(() => {
  detach()
  vi.useRealTimers()
})

describe('mouse', () => {
  it('zooms with the wheel, within limits', () => {
    setup()
    hub.emit({ type: 'wheel', deltaY: -100, x: 0, y: 0 })
    expect(store().scale).toBeCloseTo(Math.exp(0.12), 9)
    for (let i = 0; i < 50; i++) hub.emit({ type: 'wheel', deltaY: -200, x: 0, y: 0 })
    expect(store().scale).toBe(2.5)
    for (let i = 0; i < 50; i++) hub.emit({ type: 'wheel', deltaY: 200, x: 0, y: 0 })
    expect(store().scale).toBe(0.5)
    // The model sits above the bench in assembly, so it cannot grow as far.
    store().startAssembly()
    for (let i = 0; i < 50; i++) hub.emit({ type: 'wheel', deltaY: -200, x: 0, y: 0 })
    expect(store().scale).toBe(1.6)
  })

  it('turns the model as it is dragged', () => {
    setup()
    press('mouse', 500, 400)
    drag('mouse', 600, 400)
    // 100 px across the screen turns it by 100 × 3.2 / height about the vertical axis.
    const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (100 * 3.2) / H)
    expect(rig.rotation.angleTo(expected)).toBeCloseTo(0, 6)
    drag('mouse', 600, 450)
    expect(new Vector3(0, 0, 1).applyQuaternion(rig.rotation).y).toBeLessThan(0)
  })

  it('keeps spinning after a flick, slowing to a stop', () => {
    setup()
    press('mouse', 300, 400)
    drag('mouse', 700, 400, 8)
    release('mouse')
    const atRelease = rig.rotation.clone()
    frame()
    const step1 = rig.rotation.angleTo(atRelease)
    expect(step1).toBeGreaterThan(0)
    let prev = rig.rotation.clone()
    let step = step1
    for (let i = 0; i < 60; i++) {
      frame()
      const now = rig.rotation.angleTo(prev)
      expect(now).toBeLessThanOrEqual(step + 1e-9)
      step = now
      prev = rig.rotation.clone()
    }
    frames(240)
    prev = rig.rotation.clone()
    frame()
    expect(rig.rotation.angleTo(prev)).toBeCloseTo(0, 6)
  })

  it('stops a spin when the model is grabbed again', () => {
    setup()
    press('mouse', 300, 400)
    drag('mouse', 700, 400, 8)
    release('mouse')
    frames(2)
    press('mouse', 700, 400)
    const held = rig.rotation.clone()
    frames(10)
    expect(rig.rotation.angleTo(held)).toBeCloseTo(0, 6)
    // Still stopped after letting go again.
    release('mouse')
    frames(10)
    expect(rig.rotation.angleTo(held)).toBeCloseTo(0, 6)
  })

  it('stops a spin with a quick tap', () => {
    setup()
    press('mouse', 300, 400)
    drag('mouse', 700, 400, 8)
    release('mouse')
    frames(2)
    press('mouse', 100, 100)
    frame()
    release('mouse')
    const tapped = rig.rotation.clone()
    frames(10)
    expect(rig.rotation.angleTo(tapped)).toBeCloseTo(0, 6)
  })

  it('selects a part with a tap, and deselects with a second tap or a tap on nothing', () => {
    setup([{ id: 'lid', x: 500, y: 300, where: 'model' }])
    const tap = (x: number, y: number) => {
      press('mouse', x, y)
      frame()
      release('mouse')
    }
    tap(500, 300)
    expect(store().selected).toBe('lid')
    expect(sounds()).toEqual(['click'])
    tap(500, 300)
    expect(store().selected).toBeNull()
    tap(500, 300)
    tap(100, 100)
    expect(store().selected).toBeNull()
  })

  it('does not count a slow press or a drag as a tap', () => {
    setup([{ id: 'lid', x: 500, y: 300, where: 'model' }])
    press('mouse', 500, 300)
    frames(30)
    release('mouse')
    expect(store().selected).toBeNull()
    press('mouse', 500, 300)
    drag('mouse', 515, 300, 2)
    release('mouse')
    expect(store().selected).toBeNull()
  })

  it('opens a part in Study with a double click, and a piece in Study', () => {
    setup([
      { id: 'lobe', x: 500, y: 300, where: 'model' },
      { id: 'a', x: 450, y: 500, where: 'piece' },
    ])
    hub.emit({ type: 'doubleclick', x: 100, y: 100 })
    expect(store().mode).toBe('explore')
    hub.emit({ type: 'doubleclick', x: 500, y: 300 })
    expect(store()).toMatchObject({ mode: 'study', studyPart: 'lobe', studyPath: [] })
    hub.emit({ type: 'doubleclick', x: 450, y: 500 })
    expect(store().studyPath).toEqual(['a'])
    expect(sounds()).toEqual(['open', 'open'])
  })
})

describe('hands', () => {
  it('ignores small jitter, then follows at the edge of the band', () => {
    setup()
    press('hand0', 500, 400)
    drag('hand0', 502, 400, 1)
    expect(angle(rig.rotation)).toBeCloseTo(0, 6)
    drag('hand0', 512, 400, 1)
    // 12 px from the anchor, less the 3 px band.
    const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (9 * 3.2) / H)
    expect(rig.rotation.angleTo(expected)).toBeCloseTo(0, 9)
  })

  it('puts the model back as it was just before the fingers opened', () => {
    setup()
    press('hand0', 300, 400)
    const poses: { time: number; rotation: Quaternion }[] = []
    for (let i = 1; i <= 40; i++) {
      move('hand0', 300 + 10 * i, 400)
      frame()
      poses.push({ time: performance.now(), rotation: rig.rotation.clone() })
    }
    release('hand0')
    // The pose recorded at least 180 ms before letting go.
    const cutoff = performance.now() - 180
    const kept = poses.filter((p) => p.time <= cutoff).at(-1)!
    expect(rig.rotation.angleTo(kept.rotation)).toBeCloseTo(0, 9)
    expect(rig.rotation.angleTo(poses.at(-1)!.rotation)).toBeGreaterThan(0)
    // And no fling: a hand is not a flick.
    const after = rig.rotation.clone()
    frames(10)
    expect(rig.rotation.angleTo(after)).toBeCloseTo(0, 6)
  })

  it('does nothing on release when tracking was lost', () => {
    setup()
    press('hand0', 300, 400)
    drag('hand0', 500, 400, 20)
    const atLoss = rig.rotation.clone()
    release('hand0', true)
    expect(rig.rotation.angleTo(atLoss)).toBeCloseTo(0, 6)
  })

  it('opens a part in Study with a double pinch', () => {
    setup([{ id: 'lid', x: 500, y: 300, where: 'model' }])
    const pinch = () => {
      press('hand0', 500, 300)
      frame()
      release('hand0')
    }
    pinch()
    expect(store().mode).toBe('explore')
    vi.advanceTimersByTime(200)
    pinch()
    expect(store()).toMatchObject({ mode: 'study', studyPart: 'lid' })
    expect(sounds().at(-1)).toBe('open')
  })

  it('needs the two pinches close together, on the same part', () => {
    setup([
      { id: 'lid', x: 500, y: 300, where: 'model' },
      { id: 'knob', x: 700, y: 300, where: 'model' },
    ])
    const pinch = (x: number) => {
      press('hand0', x, 300)
      frame()
      release('hand0')
    }
    pinch(500)
    vi.advanceTimersByTime(600)
    pinch(500)
    expect(store().mode).toBe('explore')
    vi.advanceTimersByTime(100)
    pinch(700)
    expect(store().mode).toBe('explore')
  })

  it('goes into a piece with a pinch in Study', () => {
    setup([{ id: 'b', x: 450, y: 500, where: 'piece' }])
    store().openStudy('lobe')
    press('hand0', 450, 500)
    frame()
    release('hand0')
    expect(store().studyPath).toEqual(['b'])
  })

  it('backs out one level with a fist, innermost first', () => {
    setup()
    const fist = () => hub.emit({ type: 'fist', pointer: pointer('hand0', 0, 0) })
    useLab.getState().set({ settingsOpen: true })
    store().set({ explode: 0.5, selected: 'lid' })
    store().openStudy('lobe')
    store().openPiece('b')
    fist()
    expect(useLab.getState().settingsOpen).toBe(false)
    expect(store().studyPath).toEqual(['b'])
    fist()
    expect(store().studyPath).toEqual([])
    fist()
    expect(store().mode).toBe('explore')
    // Studying a part selects it, so that is next.
    expect(store().selected).toBe('lobe')
    fist()
    expect(store().selected).toBeNull()
    expect(store().explode).toBe(0.5)
    fist()
    expect(store().explode).toBe(0)
    // Nothing left to close: no sound.
    mocks.play.mockClear()
    fist()
    expect(sounds()).toEqual([])
  })

  it('ends a guided tour with a fist', () => {
    setup()
    store().set({ tourStep: 2 })
    hub.emit({ type: 'fist', pointer: pointer('hand0', 0, 0) })
    expect(store().tourStep).toBeNull()
  })

  it('resets the view with a palm push, except while assembling or carrying', () => {
    setup()
    store().set({ scale: 2, explode: 0.7 })
    hub.emit({ type: 'reset' })
    expect(store()).toMatchObject({ scale: 1, explode: 0 })
    expect(sounds()).toEqual(['click'])

    store().set({ scale: 2, carried: 'lid' })
    hub.emit({ type: 'reset' })
    expect(store().scale).toBe(2)
    store().startAssembly()
    store().set({ scale: 1.4 })
    hub.emit({ type: 'reset' })
    expect(store().scale).toBe(1.4)
  })
})

describe('bloom', () => {
  it('scales the model with the fingertip spread, live', () => {
    setup()
    store().set({ scale: 1.2 })
    const p = hover('hand0', 500, 400)
    hub.emit({ type: 'bloom', phase: 'start', pointer: p })
    p.bloom = 1.5
    frame()
    expect(store().scale).toBeCloseTo(1.8, 9)
    p.bloom = 0.8
    frame()
    expect(store().scale).toBeCloseTo(0.96, 9)
    p.bloom = 10
    frame()
    expect(store().scale).toBe(2.5)
    hub.emit({ type: 'bloom', phase: 'end', pointer: p })
    p.bloom = 1
    frame()
    expect(store().scale).toBe(2.5)
  })

  it('stops when the hand stops blooming', () => {
    setup()
    const p = hover('hand0', 500, 400)
    hub.emit({ type: 'bloom', phase: 'start', pointer: p })
    p.bloom = 1.4
    frame()
    p.bloom = null
    frame()
    p.bloom = 2
    frame()
    expect(store().scale).toBeCloseTo(1.4, 9)
  })
})

describe('two hands', () => {
  /** Pinches both hands, at the given spots, and lets the controller see them. */
  const pinchBoth = (a: [number, number], b: [number, number]) => {
    press('hand0', ...a)
    frame()
    press('hand1', ...b)
    frame()
  }
  const pullApart = (a: [number, number], b: [number, number], n = 10) => {
    const pa = hub.pointers.get('hand0')!
    const pb = hub.pointers.get('hand1')!
    const [a0, b0] = [{ x: pa.x, y: pa.y }, { x: pb.x, y: pb.y }]
    for (let i = 1; i <= n; i++) {
      move('hand0', a0.x + ((a[0] - a0.x) * i) / n, a0.y + ((a[1] - a0.y) * i) / n)
      move('hand1', b0.x + ((b[0] - b0.x) * i) / n, b0.y + ((b[1] - b0.y) * i) / n)
      frame()
    }
  }
  /** The distance ratio the controller sees for these hand positions. */
  const ratio = (a0: [number, number], b0: [number, number], a: [number, number], b: [number, number]) =>
    new PinchPair({ x: a0[0], y: a0[1] }, { x: b0[0], y: b0[1] }).update({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }).ratio

  it('explodes the model when pulled apart near it', () => {
    setup()
    pinchBoth([450, 400], [550, 400])
    expect(gestureHud.two).toEqual({ kind: 'explode', a: 'hand0', b: 'hand1' })
    pullApart([400, 400], [600, 400])
    const expected = (ratio([450, 400], [550, 400], [400, 400], [600, 400]) - 1) * tuning.get().explodeGain
    expect(store().explode).toBeCloseTo(Math.min(1, expected), 9)
    pullApart([440, 400], [560, 400])
    expect(store().explode).toBeLessThan(expected)
    pullApart([100, 400], [900, 400])
    expect(store().explode).toBe(1)
  })

  it('scales the model when pulled apart away from it', () => {
    setup()
    store().set({ scale: 1.2 })
    pinchBoth([50, 100], [150, 100])
    expect(gestureHud.two?.kind).toBe('scale')
    pullApart([30, 100], [170, 100])
    expect(store().scale).toBeCloseTo(1.2 * ratio([50, 100], [150, 100], [30, 100], [170, 100]), 9)
    expect(store().explode).toBe(0)
  })

  it('spreads the pieces in Study, or scales a part with none', () => {
    setup()
    store().openStudy('lobe')
    pinchBoth([450, 400], [550, 400])
    pullApart([400, 400], [600, 400])
    expect(store().pieceSpread).toBeGreaterThan(0)
    expect(store().explode).toBe(0)
    release('hand1')
    release('hand0')

    store().openStudy('lid')
    pinchBoth([450, 400], [550, 400])
    expect(gestureHud.two?.kind).toBe('scale')
  })

  it('rolls the model when both hands twist like a wheel', () => {
    setup()
    pinchBoth([400, 400], [600, 400])
    // Turn the line between the hands by 30° (clockwise on screen).
    const t = (30 * Math.PI) / 180
    pullApart([500 - 100 * Math.cos(t), 400 - 100 * Math.sin(t)], [500 + 100 * Math.cos(t), 400 + 100 * Math.sin(t)])
    const tilted = new Vector3(1, 0, 0).applyQuaternion(rig.rotation)
    // Rolled about the view axis, by the twist less the 4° jitter band, the other way in 3D.
    expect(tilted.z).toBeCloseTo(0, 9)
    expect(Math.atan2(tilted.y, tilted.x)).toBeCloseTo(-(t - (4 * Math.PI) / 180), 6)
  })

  it('puts the explode back as it was just before the fingers opened', () => {
    setup()
    pinchBoth([400, 400], [600, 400])
    pullApart([370, 400], [630, 400], 20)
    const held = store().explode
    expect(held).toBeGreaterThan(0.2)
    vi.advanceTimersByTime(300)
    controller.update(0)
    // Fingers opening jolt the hands just before release.
    pullApart([360, 400], [650, 400], 2)
    expect(store().explode).toBeGreaterThan(held)
    release('hand1')
    expect(store().explode).toBeCloseTo(held, 9)
    // The gesture HUD clears on the next frame.
    frame()
    expect(gestureHud.two).toBeNull()
    expect(store().explode).toBeCloseTo(held, 9)
  })

  it('takes over from a bloom', () => {
    setup()
    const p = hover('hand0', 450, 400)
    hub.emit({ type: 'bloom', phase: 'start', pointer: p })
    p.bloom = 2
    frame()
    expect(store().scale).toBe(2)
    pinchBoth([450, 400], [550, 400])
    p.bloom = 0.6
    frames(3)
    // The two-hand gesture owns the scale now; the bloom is forgotten.
    release('hand1')
    release('hand0')
    frame()
    expect(store().scale).toBe(2)
  })

  it('ignores a bloom that starts during a two-hand gesture', () => {
    setup()
    store().set({ scale: 1.2 })
    pinchBoth([50, 100], [150, 100])
    const p = hub.pointers.get('hand0')!
    hub.emit({ type: 'bloom', phase: 'start', pointer: p })
    p.bloom = 2
    frames(2)
    release('hand1')
    frames(2)
    expect(store().scale).toBeCloseTo(1.2, 9)
  })

  it('ignores a second hand while the first carries a part in assembly', () => {
    setup([{ id: 'lid', x: 300, y: 700, where: 'bench' }])
    store().startAssembly()
    press('hand0', 300, 700)
    frame()
    press('hand1', 600, 700)
    frame()
    expect(gestureHud.two).toBeNull()
    expect(store().carried).toBe('lid')
  })
})

describe('parts in explore', () => {
  it('drags a part out of the exploded model and lets it spring back', () => {
    setup([{ id: 'lid', x: 500, y: 300, where: 'model' }])
    store().set({ explode: 0.5 })
    press('mouse', 500, 300)
    expect(rig.relocate).toHaveBeenLastCalledWith('lid', 'carry')
    expect(store().selected).toBe('lid')
    expect(sounds()).toEqual(['pick'])
    drag('mouse', 650, 250)
    // It follows the pointer on a camera-facing plane through its slot.
    const at = rig.carried.get('lid')!
    expect(at.z).toBeCloseTo(0.2, 9)
    expect(toScreen(at)).toEqual({ x: expect.closeTo(650, 6), y: expect.closeTo(250, 6) })
    release('mouse')
    expect(rig.relocate).toHaveBeenLastCalledWith('lid', 'model')
  })

  it('only drags parts out once the model is exploded', () => {
    setup([{ id: 'lid', x: 500, y: 300, where: 'model' }])
    store().set({ explode: 0.1 })
    press('mouse', 500, 300)
    expect(rig.relocate).not.toHaveBeenCalled()
  })

  it('opens a held part in Study when the other hand pulls away', () => {
    setup([{ id: 'lid', x: 500, y: 300, where: 'model' }])
    store().set({ explode: 0.6 })
    press('hand0', 500, 300)
    frame()
    press('hand1', 560, 300)
    frame()
    expect(gestureHud.two).toEqual({ kind: 'stretch', a: 'hand0', b: 'hand1' })
    drag('hand1', 570, 300, 2)
    expect(store().mode).toBe('explore')
    drag('hand1', 600, 300, 4)
    expect(store()).toMatchObject({ mode: 'study', studyPart: 'lid' })
    expect(rig.relocate).toHaveBeenLastCalledWith('lid', 'model')
    expect(sounds().at(-1)).toBe('open')
  })

  it('goes into a held piece in Study when the other hand pulls away', () => {
    setup([{ id: 'b', x: 450, y: 500, where: 'piece' }])
    store().openStudy('lobe')
    press('hand0', 450, 500)
    frame()
    press('hand1', 520, 500)
    frame()
    drag('hand1', 600, 500, 4)
    expect(store().studyPath).toEqual(['b'])
  })
})

describe('assembly', () => {
  /** Assembly with the base placed, and the lid, knob and lobe waiting on the bench. */
  const startAssembly = () => {
    setup([
      { id: 'lid', x: 300, y: 700, where: 'bench' },
      { id: 'knob', x: 500, y: 700, where: 'bench' },
      { id: 'lobe', x: 700, y: 700, where: 'bench' },
    ])
    store().startAssembly()
  }
  const slotOnScreen = () => toScreen(new Vector3(0.3, 0.4, 0.2))
  /** Carries a part from the bench and lets go at a spot. */
  const carry = (from: [number, number], to: { x: number; y: number }) => {
    press('mouse', ...from)
    drag('mouse', to.x, to.y)
    release('mouse')
  }

  it('picks a part up off the bench', () => {
    startAssembly()
    press('mouse', 300, 700)
    expect(store()).toMatchObject({ carried: 'lid', hovered: null })
    expect(rig.relocate).toHaveBeenLastCalledWith('lid', 'carry')
    expect(sounds()).toEqual(['pick'])
  })

  it('snaps a part into place when let go near its slot', () => {
    startAssembly()
    const slot = slotOnScreen()
    carry([300, 700], { x: slot.x + 40, y: slot.y - 30 })
    expect(store().placed).toEqual(['base', 'lid'])
    expect(store().carried).toBeNull()
    expect(rig.relocate).toHaveBeenLastCalledWith('lid', 'model')
    expect(rig.flash).toHaveBeenCalledWith('lid')
    expect(sounds()).toEqual(['pick', 'snap'])
  })

  it('sends a part back to the bench when let go too far from its slot', () => {
    startAssembly()
    const slot = slotOnScreen()
    carry([300, 700], { x: slot.x + 70, y: slot.y })
    expect(store().placed).toEqual(['base'])
    expect(rig.relocate).toHaveBeenLastCalledWith('lid', 'bench')
    expect(sounds()).toEqual(['pick'])
  })

  it('refuses a part placed out of order', () => {
    startAssembly()
    carry([500, 700], slotOnScreen())
    expect(store().placed).toEqual(['base'])
    expect(store().message).toMatchObject({ kind: 'wrong', partId: 'knob' })
    expect(rig.relocate).toHaveBeenLastCalledWith('knob', 'bench')
    expect(sounds()).toEqual(['pick', 'wrong'])
  })

  it('celebrates the last part', () => {
    startAssembly()
    for (const x of [300, 500, 700]) carry([x, 700], slotOnScreen())
    expect(store().placed).toEqual(['base', 'lid', 'knob', 'lobe'])
    expect(sounds()).toEqual(['pick', 'snap', 'pick', 'snap', 'pick', 'success'])
  })

  it('returns a carried part to the bench when tracking is lost', () => {
    startAssembly()
    press('hand0', 300, 700)
    drag('hand0', slotOnScreen().x, slotOnScreen().y)
    release('hand0', true)
    expect(store().placed).toEqual(['base'])
    expect(store().carried).toBeNull()
    expect(rig.relocate).toHaveBeenLastCalledWith('lid', 'bench')
  })
})

describe('hover', () => {
  it('highlights the part under a free pointer, with one hover sound', () => {
    setup([{ id: 'lid', x: 500, y: 300, where: 'model' }])
    hover('mouse', 500, 300)
    frames(3)
    expect(store().hovered).toBe('lid')
    expect(sounds()).toEqual(['hover'])
    hover('mouse', 100, 100)
    frame()
    expect(store().hovered).toBeNull()
  })

  it('ignores pressed pointers and looks only at the bench in assembly', () => {
    setup([
      { id: 'lid', x: 500, y: 300, where: 'model' },
      { id: 'knob', x: 300, y: 700, where: 'bench' },
    ])
    press('mouse', 500, 300)
    frame()
    expect(store().hovered).toBeNull()
    release('mouse')
    store().startAssembly()
    hover('mouse', 500, 300)
    frame()
    expect(store().hovered).toBeNull()
    hover('mouse', 300, 700)
    frame()
    expect(store().hovered).toBe('knob')
  })

  it('highlights pieces instead of parts in Study', () => {
    setup([
      { id: 'lid', x: 500, y: 300, where: 'model' },
      { id: 'a', x: 500, y: 300, where: 'piece' },
    ])
    store().openStudy('lobe')
    hover('mouse', 500, 300)
    frame()
    expect(store()).toMatchObject({ hovered: null, hoveredPiece: 'a' })
  })

  it('stops listening once detached', () => {
    setup([{ id: 'lid', x: 500, y: 300, where: 'model' }])
    detach()
    hub.emit({ type: 'wheel', deltaY: -500, x: 0, y: 0 })
    expect(store().scale).toBe(1)
  })
})
