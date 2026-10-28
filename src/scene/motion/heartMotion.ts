// Heartbeat and the whole circulation. Atria then ventricles contract, the valves open
// and shut in phase, and blood cells travel the double loop: oxygen-poor (blue) blood
// from the body fills the right heart and is pushed to the lungs, where it turns red;
// it comes back to the left heart and is pushed out through the aorta to the body,
// where it gives up its oxygen and turns blue again. The lungs breathe.
//
// Flow follows the cardiac cycle: blood waits in the atria while the tricuspid and
// mitral valves are shut, rushes into the ventricles when they open, and leaves only
// while the pulmonary and aortic valves are open. Arteries pulse; veins and
// capillaries flow steadily (slowest in the capillaries, as in the body).
import { Group, Vector3 } from 'three'
import { play } from '../../audio/sfx'
import { translate, useLang } from '../../i18n'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, RigMotion } from '../modelRig'
import { Circuit, segmentCurve, type SegmentDef } from './circuit'
import { glowPart } from './glow'
import { ATRIAL, bump, heartClock, VENTRICULAR } from './heartClock'
import { BODY, HEART_SEGMENTS, LUNGS, OUTSIDE, REGION_OF, TRACER_ROUTE } from './heartCirculation'
import { disposeMesh, Label, lungMesh, tubeMesh } from './holoShapes'
import { motionInfo, resetMotionInfo } from './motionInfo'

const ATRIA = ['right_atrium', 'left_atrium']
const VENTRICLES = ['right_ventricle', 'left_ventricle']
const AV_VALVES = ['tricuspid_valve', 'mitral_valve']
const SEMILUNAR = ['pulmonary_valve', 'aortic_valve']

/** Tricuspid and mitral valves: open except while the ventricles squeeze (and just after). */
export const avOpen = (t: number) => t < VENTRICULAR[0] || t > VENTRICULAR[1] + 0.04
/** Pulmonary and aortic valves: open once ventricular pressure is high enough, until it falls. */
export const semilunarOpen = (t: number) => t > VENTRICULAR[0] + 0.04 && t < VENTRICULAR[1]

/** Model size while the circulation runs, so the lungs and the body fit on screen. */
const FIT_SCALE = 0.8

/** Breaths per minute at rest. */
const BREATHS = 14

const AIR: SegmentDef[] = [
  { id: 'trachea', points: LUNGS.trachea, radius: 0.005, color: '#bff8ff', source: 1, next: [{ id: 'right' }, { id: 'left' }] },
  { id: 'right', points: LUNGS.bronchi.right, radius: 0.004, color: '#bff8ff' },
  { id: 'left', points: LUNGS.bronchi.left, radius: 0.004, color: '#bff8ff' },
]
const reverse = (d: SegmentDef, id: string, next?: string): SegmentDef => ({
  ...d,
  id,
  points: [...d.points].reverse(),
  color: '#ffc46b',
  source: d.source ? undefined : 1,
  next: next ? [{ id: next }] : undefined,
})
const AIR_OUT: SegmentDef[] = [reverse(AIR[1], 'right', 'trachea'), reverse(AIR[2], 'left', 'trachea'), reverse(AIR[0], 'trachea')]

export function createHeartMotion(rig: ModelRig): RigMotion {
  const group = new Group()
  rig.inner.add(group)

  const blood = new Circuit(HEART_SEGMENTS, { count: 1100, size: 0.06, tracerRoute: TRACER_ROUTE })
  blood.attach(group)
  blood.onTracer = (id) => {
    // The tracer starts on the first segment, so re-entering it completes a lap.
    if (id === TRACER_ROUTE[0]) motionInfo.laps++
    motionInfo.where = REGION_OF.get(id) ?? ''
  }
  const airIn = new Circuit(AIR, { count: 70, size: 0.045, fade: 0.25 })
  const airOut = new Circuit(AIR_OUT, { count: 70, size: 0.045, fade: 0.25 })
  airIn.attach(group)
  airOut.attach(group)

  // Capillary beds outside the heart, drawn as faint vessels.
  const tubes = HEART_SEGMENTS.filter((s) => OUTSIDE.has(s.id)).map((s) => {
    const region = REGION_OF.get(s.id)
    const color = region === 'lungs' ? '#c08cff' : '#ff8aa0'
    const tube = tubeMesh(segmentCurve(s), 0.0016, color, 0.45)
    group.add(tube)
    return tube
  })
  const lungs = [lungMesh(LUNGS.right.center, LUNGS.right.radii, 1, '#ff9fc0'), lungMesh(LUNGS.left.center, LUNGS.left.radii, -1, '#ff9fc0')]
  const airways = [LUNGS.trachea, LUNGS.bronchi.right, LUNGS.bronchi.left].map((pts) =>
    tubeMesh(segmentCurve({ id: '', points: pts, radius: 0, color: '' }), 0.0016, '#9fe8ff', 0.3),
  )
  group.add(...lungs, ...airways)

  const labels = {
    lungs: new Label(0.012),
    upper: new Label(0.012),
    lower: new Label(0.012),
  }
  labels.lungs.sprite.position.set(LUNGS.right.center[0], LUNGS.right.center[1] + LUNGS.right.radii[1] + 0.012, LUNGS.right.center[2])
  labels.upper.sprite.position.set(BODY.upper[0], BODY.upper[1] + 0.03, BODY.upper[2])
  labels.lower.sprite.position.set(BODY.lower[0], BODY.lower[1] - 0.028, BODY.lower[2])
  const relabel = () => {
    const lang = useLang.getState().lang
    labels.lungs.set(translate(lang, 'circulation.label.lungs'))
    labels.upper.set(translate(lang, 'circulation.label.upperBody'))
    labels.lower.set(translate(lang, 'circulation.label.lowerBody'))
  }
  relabel()
  const offLang = useLang.subscribe(relabel)
  group.add(labels.lungs.sprite, labels.upper.sprite, labels.lower.sprite)

  let breath = 0
  let wasOn = false
  /** The zoom before we shrank the model to fit, restored on stop if the user left it alone. */
  let zoomBefore: number | null = null
  const lungScale = new Vector3()

  return {
    update(dt, r, active) {
      const { running, tempo, explode, slowMotion } = useModel.getState()
      heartClock.running = running && active
      const show = heartClock.running && explode < 0.08
      group.visible = show
      if (!heartClock.running) {
        if (wasOn) {
          resetMotionInfo()
          if (zoomBefore !== null && useModel.getState().scale === FIT_SCALE) useModel.getState().set({ scale: zoomBefore })
          zoomBefore = null
        }
        wasOn = false
        blood.update(0, { speed: () => 0 }, false)
        return
      }
      if (!wasOn) {
        motionInfo.where = REGION_OF.get(blood.tracer?.id ?? '') ?? ''
        const { scale } = useModel.getState()
        if (scale > FIT_SCALE) {
          zoomBefore = scale
          useModel.getState().set({ scale: FIT_SCALE })
        }
      }
      wasOn = true
      const time = dt * (slowMotion ? 0.25 : 1)
      heartClock.bpm = tempo
      const prev = heartClock.t
      heartClock.t += (time * tempo) / 60
      if (heartClock.t >= 1) {
        heartClock.t -= 1
        heartClock.beats++
      }
      const t = heartClock.t
      // Heart sounds: "lub" when the AV valves shut, "dub" when the semilunar valves shut.
      const crossed = (mark: number) => (prev < mark && t >= mark) || (prev > t && t >= mark)
      if (crossed(VENTRICULAR[0])) play('lub')
      if (crossed(VENTRICULAR[1])) play('dub')

      const atrial = bump(t, ATRIAL[0], ATRIAL[1])
      const ventricular = bump(t, VENTRICULAR[0], VENTRICULAR[1])
      const rapidFill = bump(t, VENTRICULAR[1] + 0.04, VENTRICULAR[1] + 0.2)
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

      const av = avOpen(t)
      const sl = semilunarOpen(t)
      for (const id of AV_VALVES) {
        const part = r.parts.get(id)
        if (part) glowPart(part, av ? 0.9 : 0)
      }
      for (const id of SEMILUNAR) {
        const part = r.parts.get(id)
        if (part) glowPart(part, sl ? 0.9 : 0)
      }

      // Speeds in model units per second; the beat scales with tempo.
      const k = tempo / 72
      const arterial = 0.035 + 0.3 * ventricular
      const speed = (id: string) => {
        const region = REGION_OF.get(id)
        switch (region) {
          case 'rightAtrium':
          case 'leftAtrium':
            return (0.03 + 0.16 * atrial + 0.12 * rapidFill) * k
          case 'rightVentricle':
          case 'leftVentricle':
            return (sl ? 0.32 : 0.05 + 0.08 * rapidFill) * k
          case 'pulmonaryArtery':
          case 'aorta':
            return arterial * k
          case 'lungs':
          case 'upperBody':
          case 'lowerBody':
            return 0.03 * k
          case 'coronary':
            // The heart muscle squeezes its own vessels shut, so it is fed mostly between beats.
            return (sl ? 0.006 : 0.03) * k
          default:
            return 0.06 * k
        }
      }
      blood.update(time, { speed, open: (gate) => (gate === 'av' ? av : sl) }, show)

      // Breathing: lungs swell on the way in; oxygen flows in, carbon dioxide out.
      breath = (breath + (time * BREATHS) / 60) % 1
      const inhale = Math.sin(breath * Math.PI * 2)
      const s = 1 + 0.07 * inhale
      for (const lung of lungs) lung.scale.copy(lungScale.set(s, 1 + 0.04 * inhale, s))
      airIn.setOpacity(Math.max(0, inhale))
      airOut.setOpacity(Math.max(0, -inhale))
      airIn.update(time, { speed: () => 0.06 * Math.max(0.15, inhale) }, show)
      airOut.update(time, { speed: () => 0.06 * Math.max(0.15, -inhale) }, show)

      motionInfo.progress = blood.tracer ? TRACER_ROUTE.indexOf(blood.tracer.id) / TRACER_ROUTE.length : 0
      motionInfo.values = { oxygen: oxygenOf(blood.tracer?.id, blood.tracer?.s ?? 0) }
    },
    dispose() {
      offLang()
      blood.dispose()
      airIn.dispose()
      airOut.dispose()
      for (const m of [...tubes, ...lungs, ...airways]) disposeMesh(m)
      for (const l of Object.values(labels)) l.dispose()
      group.removeFromParent()
      resetMotionInfo()
    },
  }
}

/** Oxygen saturation of the tracer's blood (%): ~75 in veins, ~98 in arteries. */
function oxygenOf(id: string | undefined, s: number): number {
  const region = id ? REGION_OF.get(id) : undefined
  if (region === 'lungs') return 75 + 23 * Math.min(1, s * 1.6)
  if (region === 'upperBody' || region === 'lowerBody' || id === 'lca' || id === 'rca') return 98 - 23 * Math.min(1, s * 1.6)
  const red = ['pulmonaryVeins', 'leftAtrium', 'leftVentricle', 'aorta']
  return region && red.includes(region) ? 98 : 75
}
