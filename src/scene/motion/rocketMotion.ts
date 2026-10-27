// Rocket engine firing: flame plume from the nozzle, the turbopump spinning,
// and propellants flowing (blue oxygen, gold kerosene).
import {
  AdditiveBlending,
  Box3,
  ConeGeometry,
  DoubleSide,
  Mesh,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, RigMotion } from '../modelRig'
import { Flow } from './flow'
import { glowPart } from './glow'

const SPINNING = ['turbine', 'fuel_pump', 'lox_pump']

const plumeShader = {
  uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
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
      float diamonds = 0.75 + 0.25 * sin(along * 38.0 - uTime * 6.0);
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
  rig.inner.add(plume)

  const home = (id: string) => rig.parts.get(id)!.home.clone()
  const flow = new Flow(
    [
      { points: [home('lox_pump').add(new Vector3(0, rig.rawRadius * 0.5, 0)), home('lox_pump'), home('oxidizer_lines'), home('main_oxidizer_valve'), home('injector')], color: '#7fc8ff', count: 60 },
      { points: [home('fuel_pump').add(new Vector3(0, rig.rawRadius * 0.6, -0.1)), home('fuel_pump'), home('fuel_lines'), home('main_fuel_valve'), home('cooling_jacket'), home('injector')], color: '#ffc04d', count: 60 },
    ],
    0.035,
  )
  flow.attach(rig.inner)

  let time = 0
  let power = 0
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const offset = new Vector3()
  return {
    update(dt, r, active) {
      const { running, tempo, explode } = useModel.getState()
      const on = running && active
      power += ((on ? tempo / 100 : 0) - power) * (1 - Math.exp(-dt * 3))
      time += dt
      material.uniforms.uTime.value = time
      material.uniforms.uPower.value = power * (explode < 0.1 ? 1 : 0)
      plume.visible = power > 0.01 && explode < 0.1 && nozzle.location === 'model'
      // Hang the plume under the nozzle exit.
      plume.position.set(nozzle.mesh.position.x, nozzle.mesh.position.y + box.min.y - length / 2, nozzle.mesh.position.z)
      plume.rotation.set(Math.PI, 0, 0)
      plume.scale.set(1, 0.6 + 0.4 * power, 1)
      flow.update(dt * 0.6 * power, power > 0.05 && explode < 0.1)
      if (power < 0.01) return

      q.setFromAxisAngle(up, time * 25 * power)
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
      for (const id of ['combustion_chamber', 'gas_generator']) {
        const part = r.parts.get(id)
        if (part) glowPart(part, 0.8 * power)
      }
    },
    dispose() {
      plume.removeFromParent()
      plume.geometry.dispose()
      material.dispose()
      flow.dispose()
    },
  }
}
