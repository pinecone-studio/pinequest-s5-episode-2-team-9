import { BoxGeometry, BufferGeometry, Group, Mesh, Quaternion, ShaderMaterial, Vector3 } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { useModel } from '../../lab/modelStore'
import { rocketEngine } from '../../models/rocketEngine/definition'
import type { ModelRig, PartRig } from '../modelRig'
import { motionInfo } from './motionInfo'
import { ROCKET_TRACER, rocketRegion } from './rocketFlow'
import { createRocketMotion, FULL, IGNITION_AT, MAINSTAGE_AT } from './rocketMotion'

const SPINNING = ['turbine', 'fuel_pump', 'lox_pump']
const FRAME = 1 / 60

describe('rocket motion', () => {
  const fakePart = (pose: Vector3): PartRig => {
    const holo = { uniforms: { uHighlight: { value: 0 }, uIntensity: { value: 1 } } }
    const mesh = new Mesh(new BoxGeometry(0.4, 0.6, 0.4))
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
  let motion: ReturnType<typeof createRocketMotion>
  /** Seconds the engine has been running (for checking the sequence against). */
  let elapsed: number
  const part = (id: string) => parts.get(id)!
  const glow = (id: string) => part(id).holo.uniforms.uHighlight.value
  /** One frame: the rig puts every part back in its base pose, then the motion moves it. */
  const step = (dt = FRAME, active = true) => {
    for (const p of parts.values()) {
      p.mesh.position.copy(p.pose)
      p.mesh.quaternion.identity()
      p.holo.uniforms.uHighlight.value = 0
    }
    motion.update(dt, rig, active)
    if (active && useModel.getState().running) elapsed += dt * (useModel.getState().slowMotion ? 0.25 : 1)
  }
  /** Runs until the engine has been on for `seconds`. */
  const runTo = (seconds: number) => {
    while (elapsed < seconds - 1e-9) step()
  }
  const runFor = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += FRAME) step()
  }
  const plume = () => rig.inner.children[0] as Mesh<BufferGeometry, ShaderMaterial>
  const group = () => rig.inner.children[1] as Group

  beforeEach(() => {
    // Spread the parts out; the turbopump sits off the engine's axis.
    parts = new Map(rocketEngine.parts.map((p, i) => [p.id, fakePart(new Vector3(0.1 * (i % 3), 0.05 * i, 0.08))]))
    part('turbine').pose.set(-0.5, 0.3, 0)
    part('fuel_pump').pose.set(-0.4, 0.4, 0.1)
    part('lox_pump').pose.set(-0.6, 0.5, -0.1)
    part('combustion_chamber').home.set(0.02, 0.4, -0.03)
    rig = { inner: new Group(), parts, rawRadius: 2 } as unknown as ModelRig
    elapsed = 0
    // Full throttle.
    useModel.getState().set({ running: true, tempo: 100, explode: 0, slowMotion: false })
    motion = createRocketMotion(rig)
  })

  it('stays quiet while stopped or outside explore mode', () => {
    step(FRAME, false)
    expect(group().visible).toBe(false)
    expect(plume().visible).toBe(false)
    useModel.getState().set({ running: false })
    step(1)
    expect(motionInfo.stage).toBe('')
    expect(motionInfo.values).toEqual({})
    motion.dispose()
  })

  it('spins up, ignites, then goes to mainstage on schedule', () => {
    const stages: [string, number][] = []
    while (elapsed < MAINSTAGE_AT + 1) {
      step()
      if (motionInfo.stage !== stages.at(-1)?.[0]) stages.push([motionInfo.stage, elapsed])
    }
    expect(stages.map(([s]) => s)).toEqual(['spinup', 'ignition', 'mainstage'])
    expect(stages[1][1]).toBeCloseTo(IGNITION_AT, 1)
    expect(stages[2][1]).toBeCloseTo(MAINSTAGE_AT, 1)
    motion.dispose()
  })

  it('pumps without thrust during spin-up, then builds to full thrust', () => {
    runTo(IGNITION_AT - 0.1)
    expect(motionInfo.values.rpm).toBeGreaterThan(0)
    expect(motionInfo.values.rpm).toBeLessThan(0.45 * FULL.rpm)
    expect(motionInfo.values).toMatchObject({ thrust: 0, pressure: 0, flame: 0 })

    // Ignition: the chamber lights at part power.
    runTo(MAINSTAGE_AT - 0.05)
    expect(motionInfo.values.thrust).toBeGreaterThan(0)
    expect(motionInfo.values.thrust).toBeLessThan(0.6 * FULL.thrust)
    expect(motionInfo.values.flame).toBe(FULL.flame)

    runTo(MAINSTAGE_AT + 6)
    expect(motionInfo.values.throttle).toBe(100)
    expect(motionInfo.values.thrust).toBeCloseTo(FULL.thrust, 0)
    expect(motionInfo.values.pressure).toBeCloseTo(FULL.pressure, 1)
    expect(motionInfo.values.rpm).toBeCloseTo(FULL.rpm, -1)
    expect(motionInfo.values.exhaust).toBeCloseTo(FULL.exhaust, 9)
    motion.dispose()
  })

  it('settles at the chosen throttle, never below 10%', () => {
    useModel.getState().set({ tempo: 60 })
    runTo(MAINSTAGE_AT + 8)
    expect(motionInfo.values.throttle).toBe(60)
    expect(motionInfo.values.thrust).toBeCloseTo(0.6 * FULL.thrust, 0)
    expect(motionInfo.values.rpm).toBeCloseTo(0.6 * FULL.rpm, -1)

    useModel.getState().set({ tempo: 1 })
    runFor(8)
    expect(motionInfo.values.throttle).toBe(10)
    expect(motionInfo.values.thrust).toBeCloseTo(0.1 * FULL.thrust, 0)
    motion.dispose()
  })

  it('shuts down: the flame dies quickly while the turbopump spins down', () => {
    runTo(MAINSTAGE_AT + 6)
    useModel.getState().set({ running: false })
    step()
    expect(motionInfo.stage).toBe('shutdown')
    let last = { ...motionInfo.values }
    for (let i = 0; i < 30; i++) {
      step()
      expect(motionInfo.values.thrust).toBeLessThan(last.thrust)
      expect(motionInfo.values.rpm).toBeLessThan(last.rpm)
      last = { ...motionInfo.values }
    }
    // Half a second in, the flame has fallen much further than the turbopump.
    expect(motionInfo.values.thrust / FULL.thrust).toBeLessThan(motionInfo.values.rpm / FULL.rpm)

    while (motionInfo.stage === 'shutdown') step()
    expect(motionInfo.stage).toBe('')
    expect(group().visible).toBe(false)
    expect(plume().visible).toBe(false)
    motion.dispose()
  })

  it('starts the sequence again from spin-up after a restart', () => {
    runTo(MAINSTAGE_AT + 1)
    useModel.getState().set({ running: false })
    runFor(0.5)
    useModel.getState().set({ running: true })
    step()
    expect(motionInfo.stage).toBe('spinup')
    expect(motionInfo.where).toBe('tank')
    motion.dispose()
  })

  it('holds the propellant at the shut main valves until ignition', () => {
    /** Each region the traced kerosene passes through, and when it got there. */
    const visits: [string, number][] = []
    const upstream = ['tank', 'pump']
    while (elapsed < 30 && visits.at(-1)?.[0] !== 'plume') {
      step()
      if (motionInfo.where !== visits.at(-1)?.[0]) visits.push([motionInfo.where, elapsed])
    }
    for (const [where, at] of visits) if (!upstream.includes(where)) expect(at, where).toBeGreaterThanOrEqual(IGNITION_AT)
    // Then through the cooling jacket, into the chamber and out of the nozzle, in order.
    expect(visits.map(([w]) => w)).toEqual([...new Set(ROCKET_TRACER.map(rocketRegion))])
    motion.dispose()
  })

  it('lights the gas generator first, sparks the igniter, then opens the main valves', () => {
    runTo(IGNITION_AT - 0.3)
    expect(glow('gas_generator')).toBeGreaterThan(0)
    expect(glow('igniter')).toBe(0)
    expect(glow('main_fuel_valve')).toBe(0)
    expect(glow('main_oxidizer_valve')).toBe(0)
    expect(glow('combustion_chamber')).toBe(0)

    // The igniter flashes on and off through the ignition stage.
    runTo(IGNITION_AT)
    const sparks: number[] = []
    while (elapsed < MAINSTAGE_AT - FRAME) {
      step()
      sparks.push(glow('igniter'))
      expect(glow('main_fuel_valve')).toBeCloseTo(0.6, 9)
      expect(glow('main_oxidizer_valve')).toBeCloseTo(0.6, 9)
    }
    expect(new Set(sparks)).toEqual(new Set([0, 1.2]))

    runTo(MAINSTAGE_AT + 3)
    expect(glow('igniter')).toBe(0)
    expect(glow('combustion_chamber')).toBeGreaterThan(0)
    expect(glow('nozzle')).toBeGreaterThan(0)
    expect(glow('cooling_jacket')).toBeGreaterThan(0)
    motion.dispose()
  })

  it('spins the turbopump about its own vertical shaft and leaves the rest alone', () => {
    runTo(1)
    const turbine = part('turbine')
    const turn = turbine.mesh.quaternion.clone()
    expect(turn.angleTo(new Quaternion())).toBeGreaterThan(0)
    const axis = new Vector3(turn.x, turn.y, turn.z).normalize()
    expect(Math.abs(axis.y)).toBeCloseTo(1, 9)
    for (const id of SPINNING) {
      const p = part(id)
      expect(p.mesh.quaternion.angleTo(turn), id).toBeCloseTo(0, 6)
      // Swung round the turbine's shaft: same height, same distance from it.
      const expected = p.pose.clone().sub(turbine.pose).applyQuaternion(turn).add(turbine.pose)
      expect(p.mesh.position.distanceTo(expected), id).toBeCloseTo(0, 6)
    }
    for (const id of ['combustion_chamber', 'nozzle', 'gas_generator']) {
      expect(part(id).mesh.position.equals(part(id).pose), id).toBe(true)
      expect(part(id).mesh.quaternion.equals(new Quaternion()), id).toBe(true)
    }
    motion.dispose()
  })

  it('hangs a plume under the nozzle that grows with the flame', () => {
    runTo(IGNITION_AT - 0.1)
    expect(plume().visible).toBe(false)

    runTo(IGNITION_AT + 0.3)
    expect(plume().visible).toBe(true)
    const early = plume().scale.y
    const nozzle = part('nozzle').mesh
    const exit = nozzle.position.y - 0.3
    // Centred half its length below the nozzle exit, under the nozzle's axis.
    expect(plume().position.y + (rig.rawRadius * 0.85) / 2).toBeCloseTo(exit, 6)
    expect(plume().position.x).toBe(nozzle.position.x)

    runTo(MAINSTAGE_AT + 5)
    expect(plume().scale.y).toBeGreaterThan(early)
    expect(plume().scale.y).toBeCloseTo(1.2, 2)
    expect(plume().material.uniforms.uPower.value).toBeCloseTo(1, 2)

    // No plume while the nozzle is off the engine.
    part('nozzle').location = 'bench'
    step()
    expect(plume().visible).toBe(false)
    motion.dispose()
  })

  it('hides while taken apart but keeps firing', () => {
    useModel.getState().set({ explode: 0.5 })
    runTo(MAINSTAGE_AT + 1)
    expect(group().visible).toBe(false)
    expect(plume().visible).toBe(false)
    expect(plume().material.uniforms.uPower.value).toBe(0)
    expect(motionInfo.stage).toBe('mainstage')
    expect(motionInfo.values.thrust).toBeGreaterThan(0)
    motion.dispose()
  })

  it('pauses the sequence outside explore mode and runs at quarter pace in slow motion', () => {
    for (let i = 0; i < 300; i++) step(FRAME, false)
    step()
    expect(motionInfo.stage).toBe('spinup')

    useModel.getState().set({ slowMotion: true })
    for (let i = 0; i < Math.round((IGNITION_AT * 4 - 0.5) * 60); i++) step()
    expect(motionInfo.stage).toBe('spinup')
    runTo(IGNITION_AT + 0.1)
    expect(motionInfo.stage).toBe('ignition')
    motion.dispose()
  })

  it('lines up with the chamber and cleans up on dispose', () => {
    // The chamber's top edge sat at y = 0.985 on the engine's axis when it was built.
    const box = new Vector3(0.02, 0.4 + 0.3 - 0.985, -0.03)
    expect(group().position.distanceTo(box)).toBeCloseTo(0, 6)
    runTo(1)
    motion.dispose()
    expect(rig.inner.children).toHaveLength(0)
    expect(motionInfo).toMatchObject({ stage: '', where: '', values: {} })
  })
})
