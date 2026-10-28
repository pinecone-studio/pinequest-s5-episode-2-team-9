// Rocket engine firing, with a real start-up and shut-down sequence:
//   spin-up   the gas generator lights and the turbopump spins up; propellants are
//             pumped up to the shut main valves
//   ignition  the igniter sparks, the main valves open, the chamber lights
//   mainstage full thrust at the chosen throttle
//   shutdown  valves close, the flame dies, the turbopump spins down
// Liquid oxygen (blue) and kerosene (gold) flow through the real pipes; kerosene first
// cools the nozzle wall, then both burn in the chamber, speed up through the throat
// and leave through the nozzle as the exhaust plume.
import { AdditiveBlending, Box3, ConeGeometry, DoubleSide, Group, Mesh, Quaternion, ShaderMaterial, Vector3 } from 'three'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, RigMotion } from '../modelRig'
import { Circuit } from './circuit'
import { glowPart } from './glow'
import { motionInfo, resetMotionInfo } from './motionInfo'
import { ROCKET_SEGMENTS, ROCKET_TRACER, rocketRegion } from './rocketFlow'

const SPINNING = ['turbine', 'fuel_pump', 'lox_pump']

/** Seconds into the start-up sequence when each stage begins. */
export const IGNITION_AT = 1.6
export const MAINSTAGE_AT = 2.6

/** Typical figures for a kerosene/oxygen gas-generator engine of this size, at full throttle. */
export const FULL = { pressure: 70, thrust: 650, rpm: 32000, exhaust: 2.8, flame: 3400 }

const plumeShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uPower;
    varying vec2 vUv;
    void main() {
      float along = 1.0 - vUv.y;         // 1 at the nozzle, 0 at the tip
      float flicker = 0.85 + 0.15 * sin(uTime * 40.0 + along * 30.0) * sin(uTime * 23.0);
      // Shock diamonds: bright bands where the supersonic jet is squeezed by the air.
      float diamonds = 0.7 + 0.3 * pow(abs(sin(along * 14.0 - uTime * 2.0)), 6.0);
      float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
      float a = pow(along, 0.8) * flicker * diamonds * (0.45 + 0.55 * edge) * uPower * 1.4;
      vec3 hot = vec3(1.0, 0.95, 0.8);
      vec3 warm = vec3(1.0, 0.55, 0.15);
      vec3 color = mix(warm, hot, pow(along, 3.0));
      gl_FragColor = vec4(color * a, a);
    }
  `,
}

export function createRocketMotion(rig: ModelRig): RigMotion {
  const nozzle = rig.parts.get('nozzle')!
  const box = new Box3().setFromBufferAttribute(nozzle.mesh.geometry.getAttribute('position') as never)
  const exitRadius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2
  const length = rig.rawRadius * 0.85
  const material = new ShaderMaterial({
    ...plumeShader,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
  const plume = new Mesh(new ConeGeometry(exitRadius * 0.92, length, 48, 1, true), material)
  plume.renderOrder = 3
  plume.raycast = () => {}
  rig.inner.add(plume)

  // The build script re-centred the engine; find the shift from the chamber, whose top
  // edge sits at y = 0.985 and whose axis is x = z = 0 in build coordinates.
  const chamber = rig.parts.get('combustion_chamber')!
  const cbox = new Box3().setFromBufferAttribute(chamber.mesh.geometry.getAttribute('position') as never)
  cbox.translate(chamber.home)
  const shift = new Vector3((cbox.min.x + cbox.max.x) / 2, cbox.max.y - 0.985, (cbox.min.z + cbox.max.z) / 2)
  const group = new Group()
  group.position.copy(shift)
  rig.inner.add(group)

  const flow = new Circuit(ROCKET_SEGMENTS, { count: 900, size: 0.04, tracerRoute: ROCKET_TRACER, fade: 0.2 })
  flow.attach(group)
  flow.onTracer = (id) => {
    motionInfo.where = rocketRegion(id)
  }

  let time = 0
  let clock = 0
  let pump = 0
  let flame = 0
  let spin = 0
  let wasRunning = false
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const offset = new Vector3()

  return {
    update(dt, r, active) {
      const { running, tempo, explode, slowMotion } = useModel.getState()
      const step = dt * (slowMotion ? 0.25 : 1)
      const throttle = Math.max(0.1, tempo / 100)
      if (running && !wasRunning) {
        clock = 0
        motionInfo.laps = 0
        motionInfo.where = rocketRegion(ROCKET_TRACER[0])
      }
      wasRunning = running
      const on = running && active
      if (on) clock += step

      // Targets for the turbopump and the flame in each stage.
      const stage = !running ? 'shutdown' : clock < IGNITION_AT ? 'spinup' : clock < MAINSTAGE_AT ? 'ignition' : 'mainstage'
      const pumpTarget = !on ? 0 : stage === 'spinup' ? 0.45 : throttle
      const flameTarget = !on ? 0 : stage === 'spinup' ? 0 : stage === 'ignition' ? 0.6 * throttle : throttle
      pump += (pumpTarget - pump) * (1 - Math.exp(-step * (on ? 2 : 1.4)))
      flame += (flameTarget - flame) * (1 - Math.exp(-step * (flameTarget < flame ? 4 : 2.5)))
      time += step

      const visible = (on || pump > 0.02) && explode < 0.1
      group.visible = visible
      material.uniforms.uTime.value = time
      material.uniforms.uPower.value = flame * (explode < 0.1 ? 1 : 0)
      plume.visible = flame > 0.01 && explode < 0.1 && nozzle.location === 'model'
      // Hang the plume under the nozzle exit.
      plume.position.set(nozzle.mesh.position.x, nozzle.mesh.position.y + box.min.y - length / 2, nozzle.mesh.position.z)
      plume.rotation.set(Math.PI, 0, 0)
      plume.scale.set(1, 0.6 + 0.6 * flame, 1)

      // Main valves open once the igniter has fired.
      const valvesOpen = running && clock >= IGNITION_AT
      const speed = (id: string) => {
        const region = rocketRegion(id)
        const base =
          region === 'tank' || region === 'valve' ? 0.9
          : region === 'pump' ? 1.6
          : region === 'cooling' ? 1.3
          : region === 'injector' ? 1.0
          : region === 'chamber' ? 0.7
          : region === 'throat' ? 2.4
          : region === 'nozzle' ? 6.5
          : region === 'plume' ? 9
          : id === 'turbine' ? 2.2
          : id === 'turbine_exhaust' ? 2.6
          : 1.0
        const hot = region === 'chamber' || region === 'throat' || region === 'nozzle' || region === 'plume'
        return base * (hot ? Math.max(flame, 0.05) : pump)
      }
      flow.update(step, { speed, open: () => valvesOpen }, visible)

      const p = flame
      motionInfo.stage = stage
      motionInfo.values = {
        throttle: Math.round(throttle * 100),
        pressure: FULL.pressure * p,
        thrust: FULL.thrust * p,
        rpm: FULL.rpm * pump,
        exhaust: FULL.exhaust * Math.min(1, p * 1.4),
        flame: p > 0.02 ? FULL.flame : 0,
      }
      if (!on && pump < 0.01) {
        if (motionInfo.stage) resetMotionInfo()
        return
      }

      spin += step * 30 * pump
      q.setFromAxisAngle(up, spin)
      const turbine = r.parts.get('turbine')!
      for (const id of SPINNING) {
        const part = r.parts.get(id)
        if (!part || part.location !== 'model') continue
        // Spin around the turbopump's vertical shaft.
        offset.copy(part.pose).sub(turbine.pose)
        offset.y = 0
        part.mesh.position.copy(part.pose).sub(offset).add(offset.applyQuaternion(q))
        part.mesh.quaternion.copy(q)
      }
      const flicker = 0.75 + 0.25 * Math.sin(time * 37) * Math.sin(time * 23)
      glow(r, 'gas_generator', pump > 0.15 ? 0.9 * flicker : 0)
      glow(r, 'combustion_chamber', 0.9 * flame * flicker)
      // The nozzle heats up the longer the engine fires.
      glow(r, 'nozzle', 0.5 * flame)
      glow(r, 'igniter', stage === 'ignition' && Math.sin(time * 60) > 0 ? 1.2 : 0)
      glow(r, 'main_fuel_valve', valvesOpen ? 0.6 : 0)
      glow(r, 'main_oxidizer_valve', valvesOpen ? 0.6 : 0)
      glow(r, 'cooling_jacket', 0.35 * pump)
    },
    dispose() {
      plume.removeFromParent()
      plume.geometry.dispose()
      material.dispose()
      flow.dispose()
      group.removeFromParent()
      resetMotionInfo()
    },
  }
}

function glow(r: ModelRig, id: string, amount: number) {
  const part = r.parts.get(id)
  if (part) glowPart(part, amount)
}
