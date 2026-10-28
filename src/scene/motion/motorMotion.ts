// Brushed DC motor running, showing why it turns:
// - Current (yellow) flows from the + terminal through a carbon brush into the
//   commutator, round the coil it is touching, and back out through the other brush.
// - The energized coil turns its iron tooth into an electromagnet. Its tip gets the same
//   pole as the magnet it has just passed, so it is pushed on (force arrow), and the
//   magnet ahead pulls it. Just before it would line up, the commutator hands the current
//   to the next coil, so the rotor never stops chasing the field.
// - The magnetic field (violet) runs from the north magnet across the rotor to the south
//   magnet and back round through the steel housing.
// - Spinning coils make a back-voltage: the current is high at start-up and falls as the
//   motor speeds up.
// Geometry follows scripts/build-motor.ts (shaft along x, +y up).
import { ArrowHelper, Color, Group, Vector3 } from 'three'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, RigMotion } from '../modelRig'
import { Circuit, segmentCurve, type SegmentDef, type V3 } from './circuit'
import { glowPart } from './glow'
import { Label, StreamTube } from './holoShapes'
import { motionInfo, resetMotionInfo } from './motionInfo'

const ROTOR = ['shaft', 'armature_core', 'windings', 'commutator', 'fan']
const POLES = 7
const PITCH = (Math.PI * 2) / POLES
const CURRENT = '#fff27a'
const NORTH = '#ff5d6c'
const SOUTH = '#5aa8ff'

/** Typical small 12 V motor: no-load speed, coil resistance, idle current. */
export const MOTOR = { volts: 12, rpm: 3000, ohms: 1.5, idleAmps: 0.4 }

/** Current path round coil k (rotor frame): in from its commutator bar, round the coil, back. */
function coilPath(k: number, reverse: boolean): SegmentDef {
  const c = k * PITCH
  const radial = (r: number, x: number, t = 0): V3 => [x, Math.cos(c) * r - Math.sin(c) * t, Math.sin(c) * r + Math.cos(c) * t]
  const half = 0.135
  const pts: V3[] = [
    radial(0.2, 0.9),
    radial(0.2, 0.78),
    radial(0.24, 0.68),
    radial(0.3, 0.56),
    radial(0.41, 0.56, -half),
    radial(0.41, -0.56, -half),
    radial(0.41, -0.56, half),
    radial(0.41, 0.56, half),
    radial(0.3, 0.56, 0.02),
    radial(0.24, 0.68, 0.03),
    radial(0.2, 0.78, 0.04),
    radial(0.2, 0.9, 0.04),
  ]
  if (reverse) pts.reverse()
  return { id: 'coil', points: pts, radius: 0.012, color: CURRENT, next: [{ id: 'coil' }] }
}

const SUPPLY: SegmentDef[] = [
  {
    id: 'plus',
    points: [[1.5, 0.3, 0.3], [1.36, 0.3, 0.3], [1.3, 0.28, 0.2], [1.22, 0.24, 0.1], [1.2, 0.45, 0.1], [1.05, 0.5, 0.12], [0.92, 0.39, 0.06], [0.92, 0.3, 0], [0.92, 0.21, 0]],
    radius: 0.012,
    color: CURRENT,
    source: 1,
  },
  {
    id: 'minus',
    points: [[0.92, -0.21, 0], [0.92, -0.3, 0], [0.92, -0.39, 0.06], [1.05, -0.5, 0.12], [1.2, -0.45, 0.1], [1.22, -0.24, 0.1], [1.3, -0.28, 0.2], [1.36, -0.3, 0.3], [1.5, -0.3, 0.3]],
    radius: 0.012,
    color: CURRENT,
    source: 1,
  },
]

/** Field lines: straight down through the rotor (N → S), and back up through the housing. */
function fieldLines(): V3[][] {
  const lines: V3[][] = []
  for (const x of [-0.38, 0, 0.38]) for (const z of [-0.3, 0, 0.3]) lines.push([[x, 0.66, z], [x, 0.2, z * 1.05], [x, -0.2, z * 1.05], [x, -0.66, z]])
  for (const x of [-0.3, 0.3]) {
    for (const side of [1, -1]) {
      const pts: V3[] = []
      for (let i = 0; i <= 12; i++) {
        const a = -Math.PI / 2 + (i / 12) * Math.PI
        pts.push([x, Math.sin(a) * 0.86, side * Math.cos(a) * 0.86])
      }
      lines.push(pts)
    }
  }
  return lines
}

export function createMotorMotion(rig: ModelRig): RigMotion {
  // The build script re-centred the motor; the shaft's centre was at x = 0.15 on the axis.
  const shaft = rig.parts.get('shaft')!
  shaft.mesh.geometry.computeBoundingBox()
  const center = shaft.mesh.geometry.boundingBox!.getCenter(new Vector3()).add(shaft.home)
  const group = new Group()
  group.position.copy(center).sub(new Vector3(0.15, 0, 0))
  rig.inner.add(group)
  const rotor = new Group()
  group.add(rotor)

  const supply = new Circuit(SUPPLY, { count: 80, size: 0.075, fade: 0.08 })
  supply.attach(group)
  const coils = Array.from({ length: POLES }, (_, k) =>
    ([false, true] as const).map((reverse) => {
      const c = new Circuit([coilPath(k, reverse)], { count: 40, size: 0.075 })
      c.attach(rotor)
      return c
    }),
  )
  const field = fieldLines().map((pts) => {
    const tube = new StreamTube(segmentCurve({ id: '', points: pts, radius: 0, color: '' }), 0.013, '#c77dff', 4)
    group.add(tube.mesh)
    return tube
  })

  // Pole markers on the energized teeth, and the push they feel.
  const poleLabels = [new Label(0.34, NORTH), new Label(0.34, SOUTH)]
  poleLabels[0].set('N')
  poleLabels[1].set('S')
  const arrows = [0, 1].map(() => new ArrowHelper(new Vector3(0, 1, 0), new Vector3(), 0.3, new Color('#ffe45c'), 0.09, 0.06))
  for (const a of arrows) a.traverse((o) => (o.raycast = () => {}))
  group.add(poleLabels[0].sprite, poleLabels[1].sprite, ...arrows)

  let angle = 0
  let omega = 0 // fraction of no-load speed
  let lastActive = -1
  let spark = 0
  const q = new Vector3()
  const pivot = new Vector3()
  const offset = new Vector3()
  const tangent = new Vector3()

  return {
    update(dt, r, active) {
      const { running, tempo, explode, slowMotion } = useModel.getState()
      const on = running && active
      const step = dt * (slowMotion ? 0.25 : 1)
      const throttle = on ? Math.max(0.1, tempo / 100) : 0
      // Speed builds up with the rotor's inertia and coasts down when switched off.
      omega += (throttle - omega) * (1 - Math.exp(-step * (on ? 1.6 : 0.9)))
      const visible = (on || omega > 0.01) && explode < 0.1
      group.visible = visible

      // Back-EMF: the faster it spins, the less current flows.
      const volts = MOTOR.volts * throttle
      const backEmf = MOTOR.volts * omega
      const amps = on ? Math.max(MOTOR.idleAmps * throttle, (volts - backEmf) / MOTOR.ohms + MOTOR.idleAmps * throttle) : 0
      motionInfo.values = { volts, amps, rpm: MOTOR.rpm * omega, backEmf }
      motionInfo.stage = !on ? (omega > 0.01 ? 'coasting' : '') : omega < throttle * 0.9 ? 'starting' : 'running'

      // Shown slowed down: 3 turns a second at full speed (a real one does ~50).
      angle += step * omega * Math.PI * 2 * 3
      rotor.rotation.x = angle

      // Spin the rotor parts about the shaft.
      q.set(1, 0, 0)
      pivot.copy(shaft.pose)
      for (const id of ROTOR) {
        const part = r.parts.get(id)
        if (!part || part.location !== 'model') continue
        offset.copy(part.pose).sub(pivot)
        offset.x = 0
        part.mesh.position.copy(part.pose).sub(offset).add(offset.applyAxisAngle(q, angle))
        part.mesh.quaternion.setFromAxisAngle(q, angle)
      }

      // Which coil each brush is feeding: the one that has just passed it.
      const fed = [0, Math.PI].map((brush) => {
        let best = 0
        let bestLag = Infinity
        for (let k = 0; k < POLES; k++) {
          const lag = wrap(k * PITCH + angle - brush)
          if (lag < bestLag) {
            bestLag = lag
            best = k
          }
        }
        return best
      })
      if (fed[0] !== lastActive) {
        if (lastActive !== -1) spark = 1
        lastActive = fed[0]
      }
      spark = Math.max(0, spark - step * 8)
      const flow = (0.25 + 1.2 * amps / 8) * (on ? 1 : 0)
      supply.update(step, { speed: () => flow }, visible && on)
      coils.forEach((pair, k) => {
        pair[0].update(step, { speed: () => flow }, visible && on && fed[0] === k)
        pair[1].update(step, { speed: () => flow }, visible && on && fed[1] === k)
      })
      for (const tube of field) tube.update(step * 0.6, visible ? 0.9 : 0)

      // Tooth tips: top coil becomes N (pushed away from the N magnet it just passed), bottom S.
      fed.forEach((k, i) => {
        const a = k * PITCH + angle
        const label = poleLabels[i]
        label.sprite.visible = visible && on
        label.sprite.position.set(-0.75, Math.cos(a) * 0.45, Math.sin(a) * 0.45)
        tangent.set(0, -Math.sin(a), Math.cos(a))
        const arrow = arrows[i]
        arrow.visible = visible && on
        arrow.position.set(-0.62, Math.cos(a) * 0.66, Math.sin(a) * 0.66)
        arrow.setDirection(tangent)
        arrow.setLength(0.12 + 0.25 * Math.min(1, amps / 4), 0.07, 0.05)
      })

      if (!visible) return
      glow(r, 'windings', on ? 0.1 + 0.25 * Math.min(1, amps / 4) : 0)
      glow(r, 'brushes', on ? 0.3 + spark * 1.2 : 0)
      glow(r, 'commutator', on ? 0.2 + spark * 0.8 : 0)
      glow(r, 'terminals', on ? 0.4 : 0)
      glow(r, 'north_magnet', 0.25)
      glow(r, 'south_magnet', 0.25)
    },
    dispose() {
      supply.dispose()
      for (const pair of coils) for (const c of pair) c.dispose()
      for (const t of field) t.dispose()
      for (const l of poleLabels) l.dispose()
      group.removeFromParent()
      resetMotionInfo()
    },
  }
}

function wrap(a: number): number {
  const t = Math.PI * 2
  return ((a % t) + t) % t
}

function glow(r: ModelRig, id: string, amount: number) {
  const part = r.parts.get(id)
  if (part) glowPart(part, amount)
}
