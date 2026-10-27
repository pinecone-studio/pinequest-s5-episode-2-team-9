// Heartbeat: atria then ventricles contract, valves open and close in phase,
// and blood flows (blue: body → right heart → lungs; red: lungs → left heart → body).
import { Vector3 } from 'three'
import { play } from '../../audio/sfx'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, RigMotion } from '../modelRig'
import { Flow } from './flow'
import { glowPart } from './glow'
import { ATRIAL, bump, heartClock, VENTRICULAR } from './heartClock'

const ATRIA = ['right_atrium', 'left_atrium']
const VENTRICLES = ['right_ventricle', 'left_ventricle']
const AV_VALVES = ['tricuspid_valve', 'mitral_valve']
const SEMILUNAR = ['pulmonary_valve', 'aortic_valve']

export function createHeartMotion(rig: ModelRig): RigMotion {
  const home = (id: string) => rig.parts.get(id)!.home.clone()
  const up = new Vector3(0, rig.rawRadius * 0.55, 0)
  const flow = new Flow(
    [
      {
        points: [home('superior_vena_cava').add(up.clone().multiplyScalar(0.6)), home('superior_vena_cava'), home('right_atrium'), home('tricuspid_valve'), home('right_ventricle'), home('pulmonary_valve'), home('pulmonary_trunk'), home('pulmonary_trunk').add(up.clone().multiplyScalar(0.4))],
        color: '#4f8dff',
        count: 90,
      },
      {
        points: [home('inferior_vena_cava').sub(up.clone().multiplyScalar(0.4)), home('inferior_vena_cava'), home('right_atrium'), home('tricuspid_valve'), home('right_ventricle')],
        color: '#4f8dff',
        count: 50,
      },
      {
        points: [home('pulmonary_veins').add(new Vector3(rig.rawRadius * 0.3, 0, 0)), home('pulmonary_veins'), home('left_atrium'), home('mitral_valve'), home('left_ventricle'), home('aortic_valve'), home('aorta'), home('aorta').add(up)],
        color: '#ff4d5e',
        count: 120,
      },
    ],
    0.07,
  )
  flow.attach(rig.inner)
  let lastT = 0

  return {
    update(dt, r, active) {
      const { running, tempo, explode } = useModel.getState()
      heartClock.running = running && active
      if (!heartClock.running) {
        flow.update(0, false)
        return
      }
      heartClock.bpm = tempo
      const prev = heartClock.t
      heartClock.t += (dt * tempo) / 60
      if (heartClock.t >= 1) {
        heartClock.t -= 1
        heartClock.beats++
      }
      const t = heartClock.t
      // Heart sounds: "lub" when the AV valves shut, "dub" when the semilunar valves shut.
      const crossed = (mark: number) => (prev < mark && t >= mark) || (prev > t && t >= mark)
      if (crossed(VENTRICULAR[0])) play('lub')
      if (crossed(VENTRICULAR[1])) play('dub')
      lastT = t

      const atrial = bump(t, ATRIAL[0], ATRIAL[1])
      const ventricular = bump(t, VENTRICULAR[0], VENTRICULAR[1])
      const squeeze = (ids: string[], amount: number) => {
        for (const id of ids) {
          const part = r.parts.get(id)
          if (part?.location === 'model') part.mesh.scale.multiplyScalar(1 - amount)
        }
      }
      squeeze(ATRIA, 0.08 * atrial)
      squeeze(VENTRICLES, 0.1 * ventricular)
      squeeze(['septum', 'papillary_muscles'], 0.05 * ventricular)
      squeeze(['aorta', 'pulmonary_trunk'], -0.03 * ventricular)

      const avOpen = t < VENTRICULAR[0] || t > VENTRICULAR[1] + 0.04
      const semilunarOpen = t > VENTRICULAR[0] + 0.04 && t < VENTRICULAR[1]
      for (const id of AV_VALVES) {
        const part = r.parts.get(id)
        if (part) glowPart(part, avOpen ? 0.9 : 0)
      }
      for (const id of SEMILUNAR) {
        const part = r.parts.get(id)
        if (part) glowPart(part, semilunarOpen ? 0.9 : 0)
      }

      // Blood moves fastest while the ventricles push.
      const speed = (0.05 + 0.5 * ventricular + 0.15 * atrial) * (tempo / 72)
      flow.update(speed * dt, explode < 0.08)
    },
    dispose() {
      void lastT
      flow.dispose()
    },
  }
}
