import { ArrowHelper, BoxGeometry, Group, Mesh, Quaternion, Sprite, Vector3 } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useModel } from '../../lab/modelStore'
import { electricMotor } from '../../models/electricMotor/definition'
import type { ModelRig, PartRig } from '../modelRig'
import { createMotorMotion, MOTOR } from './motorMotion'
import { motionInfo } from './motionInfo'

const mocks = vi.hoisted(() => ({ labels: [] as { sprite: Sprite; text: string }[] }))

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

const POLES = 7
const PITCH = (Math.PI * 2) / POLES
const ROTOR = ['shaft', 'armature_core', 'windings', 'commutator', 'fan']
const wrap = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)

describe('motor motion', () => {
  const fakePart = (pose: Vector3): PartRig => {
    const holo = { uniforms: { uHighlight: { value: 0 }, uIntensity: { value: 1 } } }
    const mesh = new Mesh(new BoxGeometry(1.2, 0.2, 0.2))
    mesh.material = holo as never
    return {
      def: { color: '#ffffff' },
      mesh,
      holo,
      reals: [],
      home: pose.clone(),
      pose,
      radius: 0.2,
      location: 'model',
    } as unknown as PartRig
  }

  let parts: Map<string, PartRig>
  let rig: ModelRig
  let motion: ReturnType<typeof createMotorMotion>
  const part = (id: string) => parts.get(id)!
  const glow = (id: string) => part(id).holo.uniforms.uHighlight.value
  /** One frame: the rig puts every part back in its base pose, then the motion moves it. */
  const step = (dt: number, active = true) => {
    for (const p of parts.values()) {
      p.mesh.position.copy(p.pose)
      p.mesh.quaternion.identity()
      p.holo.uniforms.uHighlight.value = 0
    }
    motion.update(dt, rig, active)
  }
  const run = (seconds: number, dt = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) step(dt)
  }
  const group = () => rig.inner.children[0] as Group
  const rotor = () => group().children[0] as Group
  /** Which coil carries current from each brush (each coil has a forward and a return circuit). */
  const energized = () => rotor().children.flatMap((c, i) => (c.visible ? [{ coil: i >> 1, brush: i & 1 }] : []))

  beforeEach(() => {
    // The shaft sits on the axis; the rest of the rotor is placed off it so turning moves it.
    parts = new Map(electricMotor.parts.map((p) => [p.id, fakePart(p.id === 'shaft' ? new Vector3() : new Vector3(0.2, 0.1, 0.05))]))
    part('shaft').home.set(0.4, 0, 0)
    rig = { inner: new Group(), parts } as unknown as ModelRig
    mocks.labels.length = 0
    // Full throttle.
    useModel.getState().set({ running: true, tempo: 100, explode: 0, slowMotion: false })
    motion = createMotorMotion(rig)
  })

  it('stays hidden and still while stopped or outside explore mode', () => {
    step(1, false)
    expect(group().visible).toBe(false)
    useModel.getState().set({ running: false })
    step(1)
    expect(motionInfo.stage).toBe('')
    expect(motionInfo.values).toEqual({ volts: 0, amps: 0, rpm: 0, backEmf: 0 })
    expect(rotor().rotation.x).toBe(0)
    motion.dispose()
  })

  it('draws a big current at start-up that falls as back-voltage builds', () => {
    step(0.001)
    expect(motionInfo.stage).toBe('starting')
    expect(motionInfo.values.volts).toBe(MOTOR.volts)
    // A stalled motor: only the coil resistance limits the current.
    expect(motionInfo.values.amps).toBeCloseTo(MOTOR.volts / MOTOR.ohms + MOTOR.idleAmps, 1)

    let last = { ...motionInfo.values }
    for (let i = 0; i < 300; i++) {
      step(1 / 60)
      const now = motionInfo.values
      expect(now.rpm).toBeGreaterThan(last.rpm)
      expect(now.amps).toBeLessThan(last.amps)
      // The back-voltage is proportional to speed and reaches the supply voltage at full speed.
      expect(now.backEmf).toBeCloseTo((MOTOR.volts * now.rpm) / MOTOR.rpm, 9)
      last = { ...now }
    }
    expect(motionInfo.stage).toBe('running')
    expect(motionInfo.values.rpm).toBeGreaterThan(0.99 * MOTOR.rpm)
    expect(motionInfo.values.amps).toBeCloseTo(MOTOR.idleAmps, 1)
    motion.dispose()
  })

  it('switches from starting to running once it is near full speed', () => {
    let stage = ''
    while (motionInfo.stage !== 'running') {
      step(1 / 60)
      stage = motionInfo.stage
      if (stage === 'starting') expect(motionInfo.values.rpm).toBeLessThan(0.9 * MOTOR.rpm)
    }
    expect(motionInfo.values.rpm).toBeGreaterThanOrEqual(0.9 * MOTOR.rpm)
    motion.dispose()
  })

  it('settles at a speed set by the throttle, never below 10%', () => {
    useModel.getState().set({ tempo: 50 })
    run(8)
    expect(motionInfo.values.volts).toBe(MOTOR.volts / 2)
    expect(motionInfo.values.rpm).toBeCloseTo(MOTOR.rpm / 2, 0)
    expect(motionInfo.values.amps).toBeCloseTo(MOTOR.idleAmps / 2, 2)
    expect(motionInfo.stage).toBe('running')

    useModel.getState().set({ tempo: 1 })
    run(8)
    expect(motionInfo.values.rpm).toBeCloseTo(MOTOR.rpm / 10, 0)
    motion.dispose()
  })

  it('coasts down with no current when switched off, then hides', () => {
    run(5)
    const turning = rotor().rotation.x
    useModel.getState().set({ running: false })
    step(1 / 60)
    expect(motionInfo.stage).toBe('coasting')
    expect(motionInfo.values).toMatchObject({ volts: 0, amps: 0 })
    expect(group().visible).toBe(true)
    expect(rotor().rotation.x).toBeGreaterThan(turning)
    // No current: the coils, pole labels and push arrows go dark while it spins down.
    expect(energized()).toEqual([])
    expect(mocks.labels.every((l) => !l.sprite.visible)).toBe(true)

    let rpm = motionInfo.values.rpm
    while (motionInfo.stage === 'coasting') {
      step(1 / 60)
      expect(motionInfo.values.rpm).toBeLessThan(rpm)
      rpm = motionInfo.values.rpm
    }
    expect(motionInfo.stage).toBe('')
    expect(group().visible).toBe(false)
    motion.dispose()
  })

  it('runs at a quarter of the pace in slow motion', () => {
    run(0.25)
    const normal = motionInfo.values.rpm
    motion.dispose()

    useModel.getState().set({ slowMotion: true })
    motion = createMotorMotion(rig)
    run(1)
    expect(motionInfo.values.rpm).toBeCloseTo(normal, 6)
    motion.dispose()
  })

  it('turns the rotor about the shaft and leaves the stator alone', () => {
    part('fan').location = 'bench'
    run(0.4)
    const angle = rotor().rotation.x
    expect(angle).toBeGreaterThan(0)
    const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle)
    for (const id of ROTOR) {
      if (id === 'fan') continue
      const p = part(id)
      expect(p.mesh.quaternion.angleTo(turn), id).toBeCloseTo(0, 6)
      // Same place along the shaft and same distance from it, swung round by the angle.
      const expected = p.pose.clone().applyAxisAngle(new Vector3(1, 0, 0), angle)
      expect(p.mesh.position.distanceTo(expected), id).toBeCloseTo(0, 9)
    }
    // Parts lying on the bench, and the stator, don't turn.
    for (const id of ['fan', 'housing', 'north_magnet', 'brushes']) {
      expect(part(id).mesh.position.equals(part(id).pose), id).toBe(true)
      expect(part(id).mesh.quaternion.equals(new Quaternion()), id).toBe(true)
    }
    motion.dispose()
  })

  it('feeds the coil just past each brush, handing over seven times a turn with a spark', () => {
    run(5)
    let handovers = 0
    let sparks = 0
    let prev = energized()
    let prevBrushes = glow('brushes')
    const start = rotor().rotation.x
    for (let i = 0; i < 2000; i++) {
      step(1 / 600)
      const now = energized()
      // One coil per brush, on opposite sides of the rotor.
      expect(now.map((e) => e.brush).sort()).toEqual([0, 1])
      const [top, bottom] = [now.find((e) => e.brush === 0)!, now.find((e) => e.brush === 1)!]
      expect(top.coil).not.toBe(bottom.coil)
      const angle = rotor().rotation.x
      expect(wrap(top.coil * PITCH + angle)).toBeLessThan(PITCH)
      expect(wrap(bottom.coil * PITCH + angle - Math.PI)).toBeLessThan(PITCH)

      if (top.coil !== prev.find((e) => e.brush === 0)!.coil) handovers++
      if (glow('brushes') > prevBrushes + 0.1) sparks++
      prev = now
      prevBrushes = glow('brushes')
    }
    const turns = (rotor().rotation.x - start) / (Math.PI * 2)
    expect(turns).toBeGreaterThan(4)
    expect(Math.abs(handovers - turns * POLES)).toBeLessThanOrEqual(1)
    expect(sparks).toBe(handovers)
    motion.dispose()
  })

  it('makes the top tooth N and the bottom one S, each pushed the way the rotor turns', () => {
    const [north, south] = mocks.labels
    expect([north.text, south.text]).toEqual(['N', 'S'])
    const arrows = group().children.filter((c): c is ArrowHelper => c instanceof ArrowHelper)
    expect(arrows).toHaveLength(2)

    const lengths: number[] = []
    for (let i = 0; i < 300; i++) {
      step(1 / 60)
      expect(north.sprite.visible && south.sprite.visible).toBe(true)
      expect(north.sprite.position.y).toBeGreaterThan(0)
      expect(south.sprite.position.y).toBeLessThan(0)
      for (const arrow of arrows) {
        const dir = new Vector3(0, 1, 0).applyQuaternion(arrow.quaternion)
        const radial = new Vector3(0, arrow.position.y, arrow.position.z)
        // Square to the radius, and pointing the way the rotor turns (+x by the right hand).
        expect(dir.dot(radial)).toBeCloseTo(0, 6)
        expect(new Vector3(1, 0, 0).cross(radial).dot(dir)).toBeGreaterThan(0)
      }
      lengths.push(arrows[0].line.scale.y)
    }
    // The push is strongest while the current is high, at start-up.
    expect(lengths[0]).toBeGreaterThan(lengths.at(-1)!)
    motion.dispose()
  })

  it('lights the windings with the current and the magnets steadily', () => {
    step(1 / 60)
    const startUp = glow('windings')
    run(5)
    expect(glow('windings')).toBeLessThan(startUp)
    expect(glow('windings')).toBeGreaterThan(0)
    expect(glow('terminals')).toBeCloseTo(0.4, 9)
    expect(glow('north_magnet')).toBeCloseTo(0.25, 9)
    expect(glow('south_magnet')).toBeCloseTo(0.25, 9)
    motion.dispose()
  })

  it('hides while taken apart but keeps spinning', () => {
    useModel.getState().set({ explode: 0.5 })
    run(1)
    expect(group().visible).toBe(false)
    expect(motionInfo.values.rpm).toBeGreaterThan(0)
    expect(rotor().rotation.x).toBeGreaterThan(0)
    expect(electricMotor.parts.every((p) => glow(p.id) === 0)).toBe(true)
    motion.dispose()
  })

  it('sits on the shaft and cleans up on dispose', () => {
    // The shaft's centre was 0.15 along the axis when the motor was built.
    expect(group().position.x).toBeCloseTo(0.4 - 0.15, 9)
    run(1)
    motion.dispose()
    expect(rig.inner.children).toHaveLength(0)
    expect(motionInfo).toMatchObject({ stage: '', values: {} })
  })
})
