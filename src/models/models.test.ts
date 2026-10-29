import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import mn from '../i18n/mn.json'
import { LOOKS } from '../scene/realisticLooks'
import { assemblyOrder, keys, pieceNode, placeable, type Connection, type PieceDef } from './ModelDefinition'
import { library } from './registry'

interface GltfJson {
  nodes: { name?: string }[]
  materials?: { name?: string }[]
}

/** The JSON chunk of a GLB. */
function glbJson(url: string): GltfJson {
  const buf = readFileSync(`public${url}`)
  const length = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + length).toString('utf8')) as GltfJson
}

/** Node names from a GLB's JSON chunk. */
function glbNodeNames(url: string): string[] {
  return glbJson(url).nodes.map((n) => n.name ?? '')
}

describe.each(library)('$id model', (def) => {
  it('has every part in its GLB', () => {
    const names = new Set(glbNodeNames(def.url))
    for (const part of def.parts) expect(names.has(part.id), part.id).toBe(true)
  })

  it('has every piece in its GLB, with unique ids and texts in English and Mongolian', () => {
    const names = new Set(glbNodeNames(def.url))
    const visit = (parent: string, pieces: PieceDef[] | undefined) => {
      if (!pieces) return
      const ids = pieces.map((p) => p.id)
      expect(new Set(ids).size, `unique pieces under ${parent}`).toBe(ids.length)
      for (const piece of pieces) {
        const node = pieceNode(parent, piece.id)
        expect(names.has(node), node).toBe(true)
        if (piece.look) expect(LOOKS, `${node} look`).toHaveProperty([piece.look])
        for (const key of [keys.pieceName(def.id, piece), keys.pieceDesc(def.id, piece)]) {
          expect(en, key).toHaveProperty([key])
          expect(mn, key).toHaveProperty([key])
        }
        visit(node, piece.pieces)
      }
    }
    for (const part of def.parts) visit(part.id, part.pieces)
  })

  it('names only known realistic looks in its GLB materials', () => {
    // Multi-material parts carry one material per look, named by its look id.
    for (const m of glbJson(def.url).materials ?? [])
      if (m.name && m.name !== 'holo') expect(LOOKS, m.name).toHaveProperty([m.name])
  })

  it('has unique part ids and valid dependencies', () => {
    const ids = def.parts.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const part of def.parts)
      for (const dep of part.dependsOn) expect(ids, `${part.id} → ${dep}`).toContain(dep)
    for (const base of def.baseParts) expect(ids).toContain(base)
    for (const part of def.parts) expect(def.groups).toContain(part.group)
  })

  it('can be assembled completely (no dependency cycles)', () => {
    const order = assemblyOrder(def)
    expect(order.length + def.baseParts.length).toBe(def.parts.length)
    const placed = new Set(def.baseParts)
    for (const id of order) {
      expect(placeable(def, placed)).toContain(id)
      placed.add(id)
    }
  })

  it('has every text in English and Mongolian', () => {
    const required = [keys.title(def.id), keys.summary(def.id), keys.credit(def.id)]
    for (const g of def.groups) required.push(keys.group(def.id, g))
    for (const p of def.parts) {
      required.push(keys.partName(def.id, p), keys.partDesc(def.id, p), keys.partFact(def.id, p))
      if (!def.baseParts.includes(p.id)) required.push(keys.partHint(def.id, p))
    }
    for (const key of required) {
      expect(en, key).toHaveProperty([key])
      expect(mn, key).toHaveProperty([key])
    }
  })

  it.runIf(def.connected)('knows where every part attaches and how blood flows through its vessels', () => {
    const root = glbJson(def.url).nodes.find((n) => (n as { extras?: unknown }).extras) as {
      extras?: { connections?: Record<string, Connection> }
    }
    const connections = root?.extras?.connections ?? {}
    for (const p of def.parts) {
      if (def.baseParts.includes(p.id)) continue
      const c = connections[p.id]
      expect(c, `${p.id} has a measured opening`).toBeDefined()
      expect(c.to, `${p.id} attaches to its first dependency`).toBe(p.dependsOn[0])
      expect(Math.hypot(...c.normal), `${p.id} normal`).toBeCloseTo(1, 2)
      if (p.flow) expect(c.path?.length ?? 0, `${p.id} has a flow path`).toBeGreaterThanOrEqual(3)
      for (const key of [keys.partLink(def.id, p)]) {
        expect(en, key).toHaveProperty([key])
        expect(mn, key).toHaveProperty([key])
      }
    }
  })

  it('has a valid guided tour', () => {
    const tour = def.tour ?? []
    expect(tour.length).toBeGreaterThan(0)
    const stepIds = tour.map((s) => s.id)
    expect(new Set(stepIds).size, 'unique step ids').toBe(stepIds.length)
    const partIds = def.parts.map((p) => p.id)
    for (const step of tour) {
      if (step.part) expect(partIds, `${step.id} → ${step.part}`).toContain(step.part)
      if (step.motion) expect(def.motion, `${step.id} plays motion`).toBeDefined()
      if (step.cutaway) expect(def.cutaway, `${step.id} uses the cut-away`).toBe(true)
      for (const key of [keys.tourTitle(def.id, step.id), keys.tourText(def.id, step.id)]) {
        expect(en, key).toHaveProperty([key])
        expect(mn, key).toHaveProperty([key])
      }
    }
  })
})
