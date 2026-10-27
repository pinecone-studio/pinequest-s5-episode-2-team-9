import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import mn from '../i18n/mn.json'
import { assemblyOrder, keys, placeable } from './ModelDefinition'
import { library } from './registry'

/** Node names from a GLB's JSON chunk. */
function glbNodeNames(url: string): string[] {
  const buf = readFileSync(`public${url}`)
  const length = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + length).toString('utf8')) as { nodes: { name?: string }[] }
  return json.nodes.map((n) => n.name ?? '')
}

describe.each(library)('$id model', (def) => {
  it('has every part in its GLB', () => {
    const names = new Set(glbNodeNames(def.url))
    for (const part of def.parts) expect(names.has(part.id), part.id).toBe(true)
  })

  it('has unique part ids and valid dependencies', () => {
    const ids = def.parts.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const part of def.parts) for (const dep of part.dependsOn) expect(ids, `${part.id} → ${dep}`).toContain(dep)
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
})
