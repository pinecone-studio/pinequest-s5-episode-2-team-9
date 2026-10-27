// Electric motor: the rotor (shaft, armature, coils, commutator, fan) spins
// around the shaft axis; the coil being switched glows.
import { Quaternion, Vector3 } from 'three'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, RigMotion } from '../modelRig'
import { glowPart } from './glow'

const ROTOR = ['shaft', 'armature_core', 'windings', 'commutator', 'fan']
const AXIS = new Vector3(1, 0, 0)

export function createMotorMotion(rig: ModelRig): RigMotion {
  let angle = 0
  const q = new Quaternion()
  const pivot = new Vector3()
  const offset = new Vector3()
  void rig
  return {
    update(dt, r, active) {
      const { running, tempo } = useModel.getState()
      if (!running || !active) return
      angle += dt * (tempo / 100) * Math.PI * 2 * 3
      q.setFromAxisAngle(AXIS, angle)
      const shaft = r.parts.get('shaft')!
      pivot.copy(shaft.pose)
      for (const id of ROTOR) {
        const part = r.parts.get(id)
        if (!part || part.location !== 'model') continue
        offset.copy(part.pose).sub(pivot)
        offset.x = 0
        part.mesh.position.copy(part.pose).sub(offset).add(offset.applyQuaternion(q))
        part.mesh.quaternion.copy(q)
      }
      const windings = r.parts.get('windings')
      if (windings) glowPart(windings, 0.35 + 0.35 * Math.sin(angle * 7))
      const brushes = r.parts.get('brushes')
      if (brushes) glowPart(brushes, 0.4)
    },
    dispose() {},
  }
}
