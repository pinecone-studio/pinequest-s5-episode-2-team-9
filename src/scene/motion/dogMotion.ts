// Robot dog gaits on the spot: each foot follows a step path (lifted in
// swing, sliding back on the ground in stance) and 2-bone inverse kinematics
// turns the foot position into hip and knee angles.
import { Quaternion, Vector3 } from 'three'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, RigMotion } from '../modelRig'

export const LEGS = ['lf', 'rf', 'lb', 'rb'] as const
type Leg = (typeof LEGS)[number]

/** Phase offsets (fraction of a cycle) and duty factor (share of the cycle in stance). */
const GAITS = {
  // Diagonal pairs move together.
  trot: { offsets: { lf: 0, rb: 0, rf: 0.5, lb: 0.5 }, duty: 0.55 },
  // One leg at a time: left-front, right-back, right-front, left-back.
  walk: { offsets: { lf: 0, rb: 0.25, rf: 0.5, lb: 0.75 }, duty: 0.75 },
} as const

/** Shared with the panel: which legs are in the air right now. */
export const dogClock = { swing: { lf: false, rf: false, lb: false, rb: false } as Record<Leg, boolean>, running: false }

interface Extras {
  joints: Record<Leg, { hip: [number, number, number]; knee: [number, number, number] }>
  thigh: number
  shin: number
  hipPitch: number
  knee: number
}

/** Foot position (x forward, y up, relative to the hip) for hip/knee angles (URDF convention). */
function footFrom(h: number, k: number, l1: number, l2: number) {
  return { x: -l1 * Math.sin(h) - l2 * Math.sin(h + k), y: -l1 * Math.cos(h) - l2 * Math.cos(h + k) }
}

/** 2-bone IK with the knee bending backwards. */
export function solveLeg(x: number, y: number, l1: number, l2: number): { h: number; k: number } {
  const X = -x
  const Y = -y
  const d = Math.min(l1 + l2 - 1e-5, Math.max(Math.abs(l1 - l2) + 1e-5, Math.hypot(X, Y)))
  const c = (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2)
  const k = -Math.acos(Math.min(1, Math.max(-1, c)))
  const scale = d / Math.max(1e-9, Math.hypot(X, Y))
  const h = Math.atan2(X * scale, Y * scale) - Math.atan2(l2 * Math.sin(k), l1 + l2 * Math.cos(k))
  return { h, k }
}

const Z = new Vector3(0, 0, 1)

export function createDogMotion(rig: ModelRig): RigMotion {
  const ex = rig.extras as unknown as Extras
  const stand = footFrom(ex.hipPitch, ex.knee, ex.thigh, ex.shin)
  const stride = 0.032
  const lift = 0.018
  let t = 0
  const q1 = new Quaternion()
  const q2 = new Quaternion()
  const hip = new Vector3()
  const knee = new Vector3()
  const kneeMoved = new Vector3()
  const tmp = new Vector3()

  return {
    update(dt, r, active) {
      const { running, tempo, gait, explode } = useModel.getState()
      dogClock.running = running && active && explode < 0.05
      if (!dogClock.running) return
      const g = GAITS[gait]
      t += dt * (0.5 + 1.8 * (tempo / 100))
      for (const leg of LEGS) {
        // A leg's offset is how far behind the first leg it runs.
        const phase = (((t - g.offsets[leg]) % 1) + 1) % 1
        let dx: number
        let dy = 0
        if (phase < g.duty) {
          // Stance: foot on the ground, sliding back as the body "moves" forward.
          dx = stride / 2 - (phase / g.duty) * stride
        } else {
          const u = (phase - g.duty) / (1 - g.duty)
          dx = -stride / 2 + u * stride
          dy = lift * Math.sin(Math.PI * u)
        }
        dogClock.swing[leg] = phase >= g.duty
        const { h, k } = solveLeg(stand.x + dx, stand.y + dy, ex.thigh, ex.shin)
        // URDF pitch axis (+y) maps to the app's −z, hence the minus signs.
        q1.setFromAxisAngle(Z, -(h - ex.hipPitch))
        q2.setFromAxisAngle(Z, -(h - ex.hipPitch) - (k - ex.knee))
        hip.fromArray(ex.joints[leg].hip)
        knee.fromArray(ex.joints[leg].knee)
        kneeMoved.copy(knee).sub(hip).applyQuaternion(q1).add(hip)

        const upper = r.parts.get(`upper_leg_${leg}`)
        if (upper?.location === 'model') {
          upper.mesh.position.copy(tmp.copy(upper.pose).sub(hip).applyQuaternion(q1).add(hip))
          upper.mesh.quaternion.copy(q1)
        }
        const lower = r.parts.get(`lower_leg_${leg}`)
        if (lower?.location === 'model') {
          lower.mesh.position.copy(tmp.copy(lower.pose).sub(knee).applyQuaternion(q2).add(kneeMoved))
          lower.mesh.quaternion.copy(q2)
        }
      }
    },
    dispose() {
      dogClock.running = false
    },
  }
}
