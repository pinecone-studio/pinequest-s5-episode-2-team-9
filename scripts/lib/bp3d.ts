// BodyParts3D (The Database Center for Life Science, CC BY 4.0) loader:
// finds element OBJ files by English name and converts them to app space.
// BP3D units are millimetres with +x = patient's left, -y = anterior, +z = up.
// App space: metres, +x = patient's left, +y = up, +z = anterior (toward the viewer).
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { indexSoup, mergeMeshData, type MeshData } from './gltf'

export const BP3D_DIR = 'scripts/.cache/bp3d'
const MESH_DIRS = ['isa/isa_BP3D_4.0_obj_99', 'partof/partof_BP3D_4.0_obj_99']

export interface Element {
  id: string
  name: string
  path: string
}

/** Every element OBJ with its English name (from the file header). */
export async function listElements(): Promise<Element[]> {
  const byId = new Map<string, Element>()
  for (const dir of MESH_DIRS) {
    const full = join(BP3D_DIR, dir)
    for (const file of await readdir(full)) {
      if (!file.endsWith('.obj')) continue
      const id = file.slice(0, -4)
      if (byId.has(id)) continue
      const path = join(full, file)
      const head = (await readFile(path, 'utf8')).slice(0, 1200)
      const name = /# English name : (.*)/.exec(head)?.[1]?.trim() ?? id
      byId.set(id, { id, name, path })
    }
  }
  return [...byId.values()]
}

/** Parses an OBJ (v + f only) into app-space triangles. */
export async function loadObj(path: string): Promise<MeshData> {
  const text = await readFile(path, 'utf8')
  const verts: number[] = []
  const soup: number[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number)
      // mm → m, z-up/-y-anterior → y-up/+z-anterior.
      verts.push(x / 1000, z / 1000, -y / 1000)
    } else if (line.startsWith('f ')) {
      const idx = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((t) => parseInt(t.split('/')[0], 10) - 1)
      for (let i = 1; i + 1 < idx.length; i++) {
        for (const k of [idx[0], idx[i], idx[i + 1]]) soup.push(verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2])
      }
    }
  }
  return indexSoup(soup)
}

export type Side = 'left' | 'right' | null

export function sideOf(name: string): Side {
  const n = name.toLowerCase()
  if (/\bleft\b/.test(n)) return 'left'
  if (/\bright\b/.test(n)) return 'right'
  return null
}

export interface GroupRule {
  id: string
  /** Matched against the lower-cased English name. */
  match: RegExp
  /** Restrict to one body side. */
  side?: 'left' | 'right'
  exclude?: RegExp
  maxTriangles: number
}

/** Assigns each element to the first matching rule and merges the meshes per rule. */
export async function buildGroups(rules: GroupRule[], elements: Element[]) {
  const members = new Map<string, Element[]>(rules.map((r) => [r.id, []]))
  for (const el of elements) {
    const n = el.name.toLowerCase()
    const rule = rules.find(
      (r) => r.match.test(n) && (!r.exclude || !r.exclude.test(n)) && (!r.side || sideOf(n) === r.side),
    )
    if (rule) members.get(rule.id)!.push(el)
  }
  const parts = []
  for (const rule of rules) {
    const els = members.get(rule.id)!
    if (!els.length) throw new Error(`No elements matched ${rule.id}`)
    const meshes = await Promise.all(els.map((e) => loadObj(e.path)))
    parts.push({ id: rule.id, data: mergeMeshData(meshes), maxTriangles: rule.maxTriangles, names: els.map((e) => e.name) })
  }
  return parts
}
