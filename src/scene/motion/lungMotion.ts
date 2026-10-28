// Breathing. The diaphragm contracts and flattens, the lungs fill (most at their base,
// where the diaphragm pulls), and fresh air flows in through the trachea and down the
// real bronchial tree into every segment, slowing as the airways multiply. Then the
// diaphragm relaxes, the lungs recoil on their own (expiration is passive: fast at first,
// then tailing off) and air rich in carbon dioxide flows back out.
//
// Numbers are textbook resting values (e.g. West, Respiratory Physiology): tidal volume
// ~500 mL with ~1.5 cm of diaphragm travel; a deep breath ~3 L and ~6 cm; inspiration
// takes ~40% of each breath; pleural pressure falls from -5 to about -8 cmH2O.
import airways from '../../models/lungs/airways.json'
import { useModel } from '../../lab/modelStore'
import type { ModelRig, RigMotion } from '../modelRig'
import { Circuit, type SegmentDef } from './circuit'
import { fadePart, glowPart } from './glow'
import { motionInfo, resetMotionInfo } from './motionInfo'

/** Fraction of each breath spent breathing in. */
export const INSPIRATION = 0.4

export const BREATH_DEPTH = {
  quiet: { volume: 500, diaphragm: 0.015, expand: 0.035, pleural: 3 },
  deep: { volume: 3000, diaphragm: 0.06, expand: 0.1, pleural: 25 },
} as const

/** Shared breathing state, read by the panel's spirogram. */
export const lungClock = { running: false, t: 0, breaths: 0 }

/** Lung volume above resting (0..1) through one breath. */
export function breathVolume(t: number): number {
  if (t < INSPIRATION) return 0.5 - 0.5 * Math.cos((Math.PI * t) / INSPIRATION)
  // Passive recoil: an exponential fall, normalized to reach zero at the end of the breath.
  const u = (t - INSPIRATION) / (1 - INSPIRATION)
  return (Math.exp(-4 * u) - Math.exp(-4)) / (1 - Math.exp(-4))
}

/** d(volume)/d(t) per breath (positive = breathing in). */
export function breathFlow(t: number): number {
  if (t < INSPIRATION) return ((0.5 * Math.PI) / INSPIRATION) * Math.sin((Math.PI * t) / INSPIRATION)
  const u = (t - INSPIRATION) / (1 - INSPIRATION)
  return (-4 * Math.exp(-4 * u)) / (1 - Math.exp(-4)) / (1 - INSPIRATION)
}
/** Largest |flow| over a breath (expiration's start), for normalizing. */
const PEAK_FLOW = Math.max(Math.abs(breathFlow(INSPIRATION + 1e-6)), breathFlow(INSPIRATION / 2))

interface AirJson {
  segments: { id: string; points: [number, number, number][]; radius: number[]; next: string[] }[]
}
const AIR = (airways as unknown as AirJson).segments
const TRACHEA_R = AIR.find((s) => s.id === 'trachea')!.radius[0]
const RADIUS = new Map(AIR.map((s) => [s.id, s.radius[0]]))

/** In: from the trachea down to every airway tip. Branches share air by their size. */
const AIR_IN: SegmentDef[] = AIR.map((s) => ({
  id: s.id,
  points: s.points,
  radius: s.radius,
  color: ['#f2feff', '#9feeff'],
  source: s.id === 'trachea' ? 1 : undefined,
  next: s.next.map((id) => ({ id, weight: AIR.find((x) => x.id === id)!.radius[0] ** 2 })),
}))

/** Out: from every tip back up to the trachea. */
const AIR_OUT: SegmentDef[] = (() => {
  const parentOf = new Map<string, string>()
  for (const s of AIR) for (const n of s.next) parentOf.set(n, s.id)
  return AIR.map((s) => ({
    id: s.id,
    points: [...s.points].reverse(),
    radius: [...s.radius].reverse(),
    color: ['#ffd9a0', '#ffb04d'] as [string, string],
    // Air leaves every tip in proportion to its size.
    source: s.next.length ? undefined : s.radius[s.radius.length - 1] ** 2 * 1e5,
    next: parentOf.has(s.id) ? [{ id: parentOf.get(s.id)! }] : undefined,
  }))
})()

const LOBES = ['right_upper_lobe', 'right_middle_lobe', 'right_lower_lobe', 'left_upper_lobe', 'left_lower_lobe']
/** How much each lobe takes part: the bases (pulled by the diaphragm) the most. */
const LOBE_SHARE: Record<string, number> = {
  right_upper_lobe: 0.6,
  right_middle_lobe: 0.85,
  right_lower_lobe: 1.25,
  left_upper_lobe: 0.7,
  left_lower_lobe: 1.25,
}
const ROOT = ['trachea', 'right_bronchial_tree', 'left_bronchial_tree', 'pulmonary_arteries', 'pulmonary_veins']

export function createLungMotion(rig: ModelRig): RigMotion {
  const airIn = new Circuit(AIR_IN, { count: 1400, size: 0.026, fade: 0.2 })
  const airOut = new Circuit(AIR_OUT, { count: 1400, size: 0.026, fade: 0.2 })
  airIn.attach(rig.inner)
  airOut.attach(rig.inner)
  let wasOn = false

  return {
    update(dt, r, active) {
      const { running, tempo, explode, slowMotion, breathDepth } = useModel.getState()
      lungClock.running = running && active
      const show = lungClock.running && explode < 0.08
      if (!lungClock.running) {
        if (wasOn) resetMotionInfo()
        wasOn = false
        airIn.update(0, { speed: () => 0 }, false)
        airOut.update(0, { speed: () => 0 }, false)
        return
      }
      wasOn = true
      const time = dt * (slowMotion ? 0.25 : 1)
      const perSecond = tempo / 60
      lungClock.t += time * perSecond
      if (lungClock.t >= 1) {
        lungClock.t -= 1
        lungClock.breaths++
      }
      const t = lungClock.t
      const depth = BREATH_DEPTH[breathDepth]
      const v = breathVolume(t)
      const flow = breathFlow(t) / PEAK_FLOW

      // The lungs: wider (ribs swing up and out), deeper (sternum forward) and longer
      // (diaphragm down). The apex stays put, so they grow downward.
      for (const id of LOBES) {
        const part = r.parts.get(id)
        if (!part || part.location !== 'model') continue
        const e = depth.expand * LOBE_SHARE[id] * v
        part.mesh.scale.x *= 1 + 0.75 * e
        part.mesh.scale.y *= 1 + 1.3 * e
        part.mesh.scale.z *= 1 + 0.85 * e
        part.mesh.position.y -= 1.3 * e * part.radius * 0.75
        part.mesh.position.x += (id.startsWith('right') ? -1 : 1) * 0.75 * e * part.radius * 0.35
        // The tissue lights up as air reaches it.
        glowPart(part, 0.35 * v)
        if (r.realistic) fadePart(part, 0.5)
      }
      // The diaphragm descends and its domes flatten; the lung roots follow a little.
      const diaphragm = r.parts.get('diaphragm')
      if (diaphragm?.location === 'model') {
        diaphragm.mesh.position.y -= depth.diaphragm * v
        diaphragm.mesh.scale.y *= 1 - 0.22 * v
        glowPart(diaphragm, 0.6 * Math.max(0, flow))
      }
      for (const id of ROOT) {
        const part = r.parts.get(id)
        if (part?.location === 'model') part.mesh.position.y -= depth.diaphragm * 0.25 * v
      }

      // Air: fast in the trachea, slower as the airways branch (their total width grows).
      const k = 0.24 * perSecond * 60 / 14 * (depth === BREATH_DEPTH.deep ? 1.6 : 1)
      const speed = (amount: number) => (id: string) =>
        k * amount * Math.min(1, Math.max(0.28, Math.sqrt((RADIUS.get(id) ?? TRACHEA_R) / TRACHEA_R)))
      airIn.setOpacity(Math.min(1, Math.max(0, flow) * 3))
      airOut.setOpacity(Math.min(1, Math.max(0, -flow) * 3))
      airIn.update(time, { speed: speed(Math.max(0, flow)) }, show)
      airOut.update(time, { speed: speed(Math.max(0, -flow)) }, show)

      const flowLs = ((depth.volume / 1000) * breathFlow(t) * perSecond)
      motionInfo.stage = flow > 0.02 ? 'inhale' : flow < -0.02 ? 'exhale' : 'pause'
      motionInfo.progress = t
      motionInfo.laps = lungClock.breaths
      motionInfo.values = {
        volume: depth.volume * v,
        flow: flowLs,
        diaphragm: depth.diaphragm * 100 * v,
        pleural: -5 - depth.pleural * v - 0.8 * flowLs,
        alveolar: -1.2 * flowLs,
      }
    },
    dispose() {
      airIn.dispose()
      airOut.dispose()
      resetMotionInfo()
      lungClock.running = false
    },
  }
}
