// Assembly guidance drawn in the scene for models that know where their parts attach:
// a pulsing ring on the opening or socket the current part joins (and a smaller one on the
// socket a cable's other end goes into), and a short pulse along a vessel or cable right after
// it is connected: red or blue blood, amber power or cyan data, in the direction it really
// flows. Pure Three — ModelScene calls update() every frame.

import {
  AdditiveBlending,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  CircleGeometry,
  Vector3,
  type Camera,
  type Material,
} from 'three'
import type { PartDef } from '../models/ModelDefinition'
import type { ModelRig } from './modelRig'
import { Circuit, type V3 } from './motion/circuit'
import { BLUE, RED } from './motion/heartCirculation'

const POWER = '#ffb347'
const DATA = '#5ee7ff'

/** How long a flow pulse runs, in seconds (it fades out over the last part). */
const PULSE_SECONDS = 3.2
const PULSE_FADE = 0.8

interface Pulse {
  circuit: Circuit
  age: number
}

export class ConnectionGuide {
  /** Lives in the rig's inner space, so it moves, turns and scales with the model. */
  readonly group = new Group()
  private ring: Mesh<RingGeometry, MeshBasicMaterial>
  private dot: Mesh<CircleGeometry, MeshBasicMaterial>
  /** The socket a cable's other end plugs into. */
  private farRing: Mesh<RingGeometry, MeshBasicMaterial>
  private pulses: Pulse[] = []
  private time = 0
  private tmp = new Vector3()
  private turn = new Quaternion()
  private readonly rig: ModelRig

  constructor(rig: ModelRig) {
    this.rig = rig
    const size = rig.rawRadius * 0.05
    this.ring = new Mesh(
      new RingGeometry(size * 0.75, size, 40),
      new MeshBasicMaterial({
        color: '#dff8ff',
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
      }),
    )
    this.dot = new Mesh(
      new CircleGeometry(size * 0.28, 24),
      new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
      }),
    )
    this.farRing = new Mesh(this.ring.geometry, this.ring.material.clone())
    this.farRing.scale.setScalar(0.7)
    for (const m of [this.ring, this.dot, this.farRing]) {
      m.renderOrder = 5
      m.raycast = () => {}
      this.group.add(m)
    }
    rig.inner.add(this.group)
  }

  /** Shows a short blood-flow pulse along a newly connected vessel. */
  pulse(id: string): void {
    const joint = this.rig.joints.get(id)
    const def = this.rig.parts.get(id)?.def
    if (!joint?.path || !def?.flow || joint.path.length < 2) return
    const points = joint.path.map((p) => [p.x, p.y, p.z] as V3)
    if (def.flow === 'in') points.reverse()
    const color = def.blood ? (def.blood === 'rich' ? RED : BLUE) : def.signal === 'data' ? DATA : POWER
    const circuit = new Circuit([{ id, points, radius: radiusOf(def, this.rig), color, source: 1 }], {
      count: 70,
      size: 0.075,
      fade: 0.2,
    })
    // Drawn over the vessel walls: in the realistic view the vessels are opaque, and the pulse sits inside them.
    ;(circuit.object.material as Material).depthTest = false
    circuit.object.renderOrder = 4
    circuit.attach(this.group)
    this.pulses.push({ circuit, age: 0 })
  }

  /**
   * Draws the target ring on the opening `target` attaches to. Returns that opening's screen position
   * (for the DOM label), or null when nothing is targeted or it is behind the model.
   */
  update(
    dt: number,
    target: string | null,
    camera: Camera,
    viewport: { width: number; height: number },
  ): { x: number; y: number } | null {
    this.time += dt
    for (const p of this.pulses) {
      p.age += dt
      const left = PULSE_SECONDS - p.age
      p.circuit.setOpacity(Math.min(1, Math.max(0, left / PULSE_FADE)))
      // Speed in raw (GLB) units per second: crosses a typical vessel in about a second.
      p.circuit.update(dt, { speed: () => this.rig.rawRadius * 0.35 }, true)
    }
    for (const p of this.pulses.filter((q) => q.age >= PULSE_SECONDS)) p.circuit.dispose()
    this.pulses = this.pulses.filter((q) => q.age < PULSE_SECONDS)

    const joint = target ? this.rig.joints.get(target) : undefined
    const visible = !!joint
    const strength = visible ? 0.55 + 0.35 * Math.sin(this.time * 5) : 0
    this.ring.material.opacity += (strength - this.ring.material.opacity) * Math.min(1, dt * 10)
    this.dot.material.opacity = this.ring.material.opacity * 0.9
    this.farRing.material.opacity = joint?.from ? this.ring.material.opacity * 0.7 : 0
    if (!joint) return null

    // The ring faces the camera (an opening seen edge-on would vanish), lifted off the surface along the opening's direction.
    const q = this.rig.inner.getWorldQuaternion(this.turn).invert().multiply(camera.quaternion)
    const lift = this.rig.rawRadius * 0.01
    for (const m of [this.ring, this.dot]) {
      m.position.copy(joint.pos).addScaledVector(joint.normal, lift)
      m.quaternion.copy(q)
    }
    if (joint.from) {
      this.farRing.position.copy(joint.from.pos)
      this.farRing.quaternion.copy(q)
    }
    const s = 1 + 0.12 * Math.sin(this.time * 5)
    this.ring.scale.setScalar(s)

    const world = this.rig.inner.localToWorld(this.tmp.copy(joint.pos))
    return this.rig.toScreen(world, camera, viewport)
  }

  dispose(): void {
    for (const p of this.pulses) p.circuit.dispose()
    this.pulses = []
    this.ring.geometry.dispose()
    this.ring.material.dispose()
    this.dot.geometry.dispose()
    this.dot.material.dispose()
    this.farRing.material.dispose()
    this.group.removeFromParent()
  }
}

/** Lumen radius for the pulse: a fraction of the vessel's size (raw GLB units). */
function radiusOf(def: PartDef, rig: ModelRig): number {
  const part = rig.parts.get(def.id)!
  return Math.min(part.radius * 0.18, rig.rawRadius * 0.03)
}
