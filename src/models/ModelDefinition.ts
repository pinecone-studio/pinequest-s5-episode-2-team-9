// Shared schema: every mode (explore, explode, study, assembly) works from this
// data alone, so a new model is a GLB plus one definition file.

import type { LookId } from '../scene/realisticLooks'

export type ModelId = 'heart' | 'robotDog' | 'brain' | 'rocketEngine' | 'electricMotor' | 'skeleton' | 'muscles'

export interface PartDef {
  /** Node name in the GLB. */
  id: string
  group: string
  /** Hologram tint. */
  color: string
  /** Parts that must be placed before this one during assembly. */
  dependsOn: string[]
  /** Shares the info card (description + fact) of another part id, e.g. the four legs. */
  info?: string
  /** Shares the wrong-order hint of another part id. */
  hint?: string
  /** Multiplies the automatic explode distance. */
  explodeScale?: number
  /** Overrides the automatic explode direction (model space). */
  explodeDir?: [number, number, number]
}

export interface ModelDefinition {
  id: ModelId
  /** URL segment: /lab/<slug>. */
  slug: string
  /** GLB in /public. */
  url: string
  groups: string[]
  parts: PartDef[]
  /** Parts that start in place during assembly. */
  baseParts: string[]
  /** Offer the cut-away slider (see-inside clipping plane). */
  cutaway: boolean
  /** Draw crisp edge lines (good for CAD models, noisy for organic ones). */
  edges: boolean
  /** Glow multiplier: dense models with many overlapping parts need less. */
  glow: number
  /** Initial view rotation (radians, XYZ euler). */
  initialRotation: [number, number, number]
  /** Accent colour for cards in the library. */
  accent: string
  /** Citations shown in the credits panel. */
  sources: { text: string; url: string }[]
  /** Optional motion the model can play. */
  motion?: 'heart' | 'motor' | 'rocket'
  /** Realistic-view materials, looked up by part id, then info id, then group, then 'default'. */
  looks: Record<string, LookId> & { default: LookId }
}

export function lookFor(def: ModelDefinition, part: PartDef): LookId {
  return def.looks[part.id] ?? (part.info ? def.looks[part.info] : undefined) ?? def.looks[part.group] ?? def.looks.default
}

// i18n key conventions (checked by tests for every part of every model).
export const keys = {
  title: (m: ModelId) => `${m}.title`,
  summary: (m: ModelId) => `${m}.summary`,
  credit: (m: ModelId) => `${m}.credit`,
  group: (m: ModelId, g: string) => `${m}.group.${g}`,
  partName: (m: ModelId, p: PartDef) => `${m}.part.${p.id}`,
  partDesc: (m: ModelId, p: PartDef) => `${m}.info.${p.info ?? p.id}.desc`,
  partFact: (m: ModelId, p: PartDef) => `${m}.info.${p.info ?? p.id}.fact`,
  partHint: (m: ModelId, p: PartDef) => `${m}.hint.${p.hint ?? p.id}`,
}

/** Assembly order: a topological sort of dependsOn, keeping definition order among peers. */
export function assemblyOrder(def: ModelDefinition): string[] {
  const done = new Set(def.baseParts)
  const order: string[] = []
  const remaining = def.parts.filter((p) => !done.has(p.id))
  while (remaining.length) {
    const i = remaining.findIndex((p) => p.dependsOn.every((d) => done.has(d)))
    if (i < 0) throw new Error(`Dependency cycle in ${def.id}: ${remaining.map((p) => p.id).join(', ')}`)
    const [part] = remaining.splice(i, 1)
    done.add(part.id)
    order.push(part.id)
  }
  return order
}

/** Parts that can be placed right now. */
export function placeable(def: ModelDefinition, placed: ReadonlySet<string>): string[] {
  return def.parts.filter((p) => !placed.has(p.id) && p.dependsOn.every((d) => placed.has(d))).map((p) => p.id)
}
