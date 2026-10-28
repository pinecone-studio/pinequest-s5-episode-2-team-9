// The brain at work: nerve signals travel along real pathways from region to region,
// step by step, while the cortex keeps up its background chatter.
//   see    eyes → optic nerves → thalamus → visual cortex → "where" (parietal) and
//          "what" (temporal) → frontal lobe decides → motor cortex → brainstem →
//          spinal cord, with the cerebellum fine-tuning the movement
//   smell  nose → olfactory pathway → amygdala and hippocampus (no thalamus stop) →
//          memory and feeling → hypothalamus → frontal lobe recognises it
//   touch  hand → spinal cord (the reflex already pulled it away) → thalamus →
//          sensory cortex → pain → frontal lobe plans → command back down
// Anchor points come from the parts' own geometry, so they sit inside the right regions.
// Axes: +z is the front of the head, +y up, +x the left hemisphere.
import { BufferAttribute, BufferGeometry, Group, Points, Vector3 } from 'three'
import { useModel, type BrainScenario } from '../../lab/modelStore'
import { createGlowPointsMaterial } from '../glowPoints'
import type { ModelRig, RigMotion } from '../modelRig'
import { Circuit, segmentCurve, type SegmentDef, type V3 } from './circuit'
import { fadePart, glowPart } from './glow'
import { disposeMesh, sphereMesh, StreamTube } from './holoShapes'
import { motionInfo, resetMotionInfo } from './motionInfo'

type Anchor =
  | 'eyeL' | 'eyeR' | 'opticL' | 'opticR' | 'chiasm' | 'lgnL' | 'lgnR' | 'visualL' | 'visualR'
  | 'whereL' | 'whereR' | 'whatL' | 'whatR' | 'decide' | 'motor' | 'basal' | 'stemTop' | 'stemMid' | 'spinal'
  | 'cerebellum' | 'thalamus' | 'nose' | 'olfFront' | 'olf' | 'amygdala' | 'hippocampus' | 'limbic'
  | 'memory' | 'hypothalamus' | 'insula' | 'sensory'

interface Step {
  paths: Anchor[][]
  /** Parts that light up when the signal arrives. */
  glow: string[]
}

export const SCENARIOS: Record<BrainScenario, Step[]> = {
  see: [
    { paths: [['eyeL', 'opticL', 'chiasm', 'lgnL'], ['eyeR', 'opticR', 'chiasm', 'lgnR']], glow: ['visual_pathway', 'thalamus'] },
    { paths: [['lgnL', 'visualL'], ['lgnR', 'visualR']], glow: ['occipital_lobe_left', 'occipital_lobe_right'] },
    { paths: [['visualL', 'whereL'], ['visualL', 'whatL'], ['visualR', 'whereR'], ['visualR', 'whatR']], glow: ['parietal_lobe_left', 'parietal_lobe_right', 'temporal_lobe_left', 'temporal_lobe_right'] },
    { paths: [['whereL', 'decide'], ['whatL', 'decide'], ['whereR', 'decide']], glow: ['frontal_lobe_left', 'frontal_lobe_right'] },
    { paths: [['decide', 'motor'], ['motor', 'basal', 'stemTop', 'stemMid', 'spinal']], glow: ['basal_ganglia', 'brainstem'] },
    { paths: [['stemMid', 'cerebellum'], ['cerebellum', 'thalamus', 'motor']], glow: ['cerebellum'] },
  ],
  smell: [
    { paths: [['nose', 'olfFront', 'olf', 'amygdala'], ['olf', 'hippocampus']], glow: ['olfactory_pathway', 'amygdala', 'hippocampus'] },
    { paths: [['hippocampus', 'limbic'], ['hippocampus', 'memory']], glow: ['limbic_cortex', 'temporal_lobe_left'] },
    { paths: [['amygdala', 'hypothalamus'], ['hypothalamus', 'stemTop', 'stemMid']], glow: ['hypothalamus', 'brainstem'] },
    { paths: [['limbic', 'decide'], ['amygdala', 'insula', 'decide']], glow: ['frontal_lobe_left', 'frontal_lobe_right', 'insula'] },
  ],
  touch: [
    { paths: [['spinal', 'stemMid', 'stemTop', 'thalamus']], glow: ['brainstem', 'thalamus'] },
    { paths: [['thalamus', 'sensory']], glow: ['parietal_lobe_left'] },
    { paths: [['sensory', 'insula'], ['sensory', 'decide']], glow: ['insula', 'frontal_lobe_left'] },
    { paths: [['decide', 'motor'], ['motor', 'basal', 'stemTop', 'stemMid', 'spinal']], glow: ['basal_ganglia', 'brainstem'] },
  ],
}

/** Seconds per step at 100% speed. */
const STEP_SECONDS = 2.8
const SIGNAL = '#7ff6ff'

export function createBrainMotion(rig: ModelRig): RigMotion {
  const group = new Group()
  rig.inner.add(group)
  const a = anchors(rig)

  const eyes = [sphereMesh(a.eyeL, 0.011, '#bff6ff'), sphereMesh(a.eyeR, 0.011, '#bff6ff')]
  const spine = new StreamTube(curveThrough([a.stemMid, a.spinal, [a.spinal[0], a.spinal[1] - 0.04, a.spinal[2] - 0.006]]), 0.006, '#fcd34d', 3)
  group.add(...eyes, spine.mesh)

  // One set of fibres and pulses per step of every scenario.
  const built = Object.fromEntries(
    (Object.keys(SCENARIOS) as BrainScenario[]).map((name) => [
      name,
      SCENARIOS[name].map((step) => {
        const defs: SegmentDef[] = step.paths.map((path, i) => ({
          id: `p${i}`,
          points: fibre(path.map((n) => a[n]), a.thalamus),
          radius: 0.002,
          color: ['#ffffff', SIGNAL],
          source: 1,
        }))
        const pulses = new Circuit(defs, { count: 22 * defs.length, size: 0.11, fade: 0.1 })
        pulses.attach(group)
        const fibres = defs.map((d) => {
          const tube = new StreamTube(segmentCurve(d), 0.0032, SIGNAL, 4)
          group.add(tube.mesh)
          return tube
        })
        return { step, pulses, fibres, lengths: defs.map((d) => pulses.lengthOf(d.id)) }
      }),
    ]),
  ) as Record<BrainScenario, { step: Step; pulses: Circuit; fibres: StreamTube[]; lengths: number[] }[]>

  const chatter = cortexChatter(rig)
  group.add(chatter.points)

  let clock = 0
  let scenario: BrainScenario | null = null
  let wasRunning = false
  const lit = new Map<string, number>()

  return {
    update(dt, r, active) {
      const { running, tempo, explode, slowMotion, brainScenario } = useModel.getState()
      const on = running && active
      const visible = on && explode < 0.1
      group.visible = visible
      if (!on) {
        if (wasRunning) resetMotionInfo()
        wasRunning = false
        for (const steps of Object.values(built)) for (const s of steps) s.pulses.update(0, { speed: () => 0 }, false)
        return
      }
      if (!wasRunning || brainScenario !== scenario) {
        clock = 0
        lit.clear()
        scenario = brainScenario
      }
      wasRunning = true
      const step = dt * (slowMotion ? 0.25 : 1) * Math.max(0.1, tempo / 100)
      clock += step
      const steps = built[brainScenario]
      const total = steps.length * STEP_SECONDS
      // A short pause after the last step, then it starts again.
      const loop = total + 1.2
      if (clock >= loop) {
        clock -= loop
        lit.clear()
      }
      const index = Math.min(steps.length - 1, Math.floor(clock / STEP_SECONDS))
      const local = clock / STEP_SECONDS - index
      motionInfo.stage = clock < total ? `${brainScenario}.${index}` : `${brainScenario}.done`
      motionInfo.values = { step: index + 1, steps: steps.length }

      for (const [name, list] of Object.entries(built)) {
        list.forEach((s, i) => {
          const current = name === brainScenario && i === index && clock < total
          // Fibres light up, pulses race along them, then they fade.
          const fade = current ? Math.min(1, local / 0.12) * Math.min(1, (1 - local) / 0.25) : 0
          for (const f of s.fibres) f.update(step * 2, visible ? 0.95 * fade : 0)
          const travel = 1.1
          s.pulses.setOpacity(fade)
          s.pulses.update(step, { speed: (id) => s.lengths[Number(id.slice(1))] / travel }, visible && fade > 0.01)
          if (current && local > 0.35) for (const id of s.step.glow) lit.set(id, Math.max(lit.get(id) ?? 0, Math.min(1, (local - 0.35) * 3)))
        })
      }
      // Dim the brain to glass so the signals inside it show; lit regions glow through.
      if (visible) for (const part of r.parts.values()) fadePart(part, 0.3)
      // Regions stay faintly lit after their turn, so the whole chain is visible.
      for (const [id, amount] of lit) {
        const part = r.parts.get(id)
        if (part) glowPart(part, amount * (steps[index].step.glow.includes(id) && clock < total ? 1.1 : 0.3))
      }
      for (const e of eyes) e.visible = brainScenario === 'see'
      spine.update(step, visible && ['see', 'touch'].includes(brainScenario) ? 0.45 : 0)
      chatter.update(step, visible)
    },
    dispose() {
      for (const steps of Object.values(built)) for (const s of steps) {
        s.pulses.dispose()
        for (const f of s.fibres) f.dispose()
      }
      for (const e of eyes) disposeMesh(e)
      spine.dispose()
      chatter.dispose()
      group.removeFromParent()
      resetMotionInfo()
    },
  }
}

/** Key points inside the brain, measured from the parts' geometry. */
function anchors(rig: ModelRig): Record<Anchor, V3> {
  const p = (id: string, dir: V3, inset = 0.35) => partPoint(rig, id, dir, inset)
  const home = (id: string): V3 => {
    const h = rig.parts.get(id)!.home
    return [h.x, h.y, h.z]
  }
  const thalamus = home('thalamus')
  const optic = p('visual_pathway', [0, 0, 1], 0.1)
  const stemTop = p('brainstem', [0, 1, 0.3], 0.5)
  const spinal = p('brainstem', [0, -1, 0], 0.15)
  const olfFront = p('olfactory_pathway', [0, 0, 1], 0.05)
  return {
    eyeL: [0.032, optic[1] - 0.03, 0.078],
    eyeR: [-0.032, optic[1] - 0.03, 0.078],
    opticL: [optic[0] + 0.012, optic[1], optic[2]],
    opticR: [optic[0] - 0.012, optic[1], optic[2]],
    chiasm: home('visual_pathway'),
    lgnL: [thalamus[0] + 0.016, thalamus[1] - 0.004, thalamus[2] - 0.012],
    lgnR: [thalamus[0] - 0.016, thalamus[1] - 0.004, thalamus[2] - 0.012],
    visualL: p('occipital_lobe_left', [0, 0, -1]),
    visualR: p('occipital_lobe_right', [0, 0, -1]),
    whereL: p('parietal_lobe_left', [0.3, 1, -0.3]),
    whereR: p('parietal_lobe_right', [-0.3, 1, -0.3]),
    whatL: p('temporal_lobe_left', [0.3, -1, 0.2]),
    whatR: p('temporal_lobe_right', [-0.3, -1, 0.2]),
    decide: p('frontal_lobe_left', [0, 0.3, 1]),
    motor: p('frontal_lobe_left', [0.2, 1, -0.7]),
    sensory: p('parietal_lobe_left', [0.2, 1, 0.6]),
    basal: home('basal_ganglia'),
    stemTop,
    stemMid: [(stemTop[0] + spinal[0]) / 2, (stemTop[1] + spinal[1]) / 2, (stemTop[2] + spinal[2]) / 2],
    spinal,
    cerebellum: home('cerebellum'),
    thalamus,
    nose: [olfFront[0], olfFront[1] - 0.02, olfFront[2] + 0.035],
    olfFront,
    olf: home('olfactory_pathway'),
    amygdala: home('amygdala'),
    hippocampus: home('hippocampus'),
    limbic: home('limbic_cortex'),
    memory: p('temporal_lobe_left', [0.5, 0, 0.6]),
    hypothalamus: home('hypothalamus'),
    insula: home('insula'),
  }
}

/** The average of a part's outermost vertices along `dir`, pulled back towards its centre. */
function partPoint(rig: ModelRig, id: string, dir: V3, inset: number): V3 {
  const part = rig.parts.get(id)!
  const pos = part.mesh.geometry.getAttribute('position')
  const d = new Vector3(...dir).normalize()
  const scores: { s: number; i: number }[] = []
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) scores.push({ s: v.fromBufferAttribute(pos, i).dot(d), i })
  scores.sort((x, y) => y.s - x.s)
  const top = scores.slice(0, Math.max(4, Math.floor(scores.length * 0.04)))
  const sum = new Vector3()
  for (const t of top) sum.add(v.fromBufferAttribute(pos, t.i))
  sum.divideScalar(top.length).add(part.home)
  sum.lerp(part.home, inset)
  return [sum.x, sum.y, sum.z]
}

/** A nerve fibre through the given points, bowing slightly inward through the white matter. */
function fibre(points: V3[], center: V3): V3[] {
  if (points.length > 2) return points
  const [a, b] = points
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const bow: V3 = [mid[0] + (center[0] - mid[0]) * 0.25, mid[1] + (center[1] - mid[1]) * 0.25, mid[2] + (center[2] - mid[2]) * 0.25]
  return [a, bow, b]
}

function curveThrough(points: V3[]) {
  return segmentCurve({ id: '', points, radius: 0, color: '' })
}

/** Faint sparks flickering all over the cortex: the brain is never quiet. */
function cortexChatter(rig: ModelRig) {
  const lobes = [...rig.parts.keys()].filter((id) => id.includes('_lobe_') || id === 'insula' || id === 'limbic_cortex')
  const count = 140
  const positions = new Float32Array(count * 3)
  const phase = new Float32Array(count)
  const rate = new Float32Array(count)
  const v = new Vector3()
  for (let i = 0; i < count; i++) {
    const part = rig.parts.get(lobes[i % lobes.length])!
    const attr = part.mesh.geometry.getAttribute('position')
    v.fromBufferAttribute(attr, Math.floor(Math.random() * attr.count)).add(part.home)
    positions.set([v.x, v.y, v.z], i * 3)
    phase[i] = Math.random() * 100
    rate[i] = 0.6 + Math.random() * 1.4
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  const color = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) color.set([0.6, 0.9, 1], i * 3)
  g.setAttribute('color', new BufferAttribute(color, 3))
  g.setAttribute('alpha', new BufferAttribute(new Float32Array(count), 1))
  const points = new Points(g, createGlowPointsMaterial(0.03))
  points.frustumCulled = false
  let t = 0
  return {
    points,
    update(dt: number, visible: boolean) {
      points.visible = visible
      if (!visible) return
      t += dt
      const alpha = g.getAttribute('alpha') as BufferAttribute
      for (let i = 0; i < count; i++) alpha.setX(i, Math.pow(Math.max(0, Math.sin(t * rate[i] * 3 + phase[i])), 24) * 0.8)
      alpha.needsUpdate = true
    },
    dispose() {
      points.removeFromParent()
      g.dispose()
      ;(points.material as { dispose(): void }).dispose()
    },
  }
}
