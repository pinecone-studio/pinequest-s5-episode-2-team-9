// Shared helpers for the asset build scripts (Node only).
import { Document, type Material, type Node } from '@gltf-transform/core'

export type Vec3 = [number, number, number]

export interface Bounds {
  min: Vec3
  max: Vec3
}

/** Applies a column-major 4x4 matrix to a point. */
export function transformPoint(m: ArrayLike<number>, x: number, y: number, z: number): Vec3 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

/** Applies the rotation/scale part of a 4x4 matrix to a direction and normalizes it. */
export function transformDirection(m: ArrayLike<number>, x: number, y: number, z: number): Vec3 {
  const v: Vec3 = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]
  const l = Math.hypot(...v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Triangle soup (world space) of every primitive under a node. */
export interface MeshData {
  positions: Float32Array<ArrayBuffer>
  normals: Float32Array<ArrayBuffer>
  indices: Uint32Array<ArrayBuffer>
}

export function worldMeshData(node: Node): MeshData {
  const mesh = node.getMesh()
  if (!mesh) return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }
  const m = node.getWorldMatrix()
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const nor = prim.getAttribute('NORMAL')
    const base = positions.length / 3
    const p: number[] = [0, 0, 0]
    const n: number[] = [0, 0, 0]
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p)
      positions.push(...transformPoint(m, p[0], p[1], p[2]))
      if (nor) {
        nor.getElement(i, n)
        normals.push(...transformDirection(m, n[0], n[1], n[2]))
      } else normals.push(0, 1, 0)
    }
    const idx = prim.getIndices()
    if (idx) for (let i = 0; i < idx.getCount(); i++) indices.push(base + idx.getScalar(i))
    else for (let i = 0; i < pos.getCount(); i++) indices.push(base + i)
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) }
}

export function boundsOf(positions: ArrayLike<number>): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k])
      max[k] = Math.max(max[k], positions[i + k])
    }
  }
  return { min, max }
}

export function worldBounds(node: Node): Bounds {
  return boundsOf(worldMeshData(node).positions)
}

export function mergeMeshData(parts: MeshData[]): MeshData {
  const total = parts.reduce((s, p) => s + p.positions.length, 0)
  const totalIdx = parts.reduce((s, p) => s + p.indices.length, 0)
  const positions = new Float32Array(total)
  const normals = new Float32Array(total)
  const indices = new Uint32Array(totalIdx)
  let o = 0
  let io = 0
  for (const p of parts) {
    positions.set(p.positions, o)
    normals.set(p.normals, o)
    for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + o / 3
    o += p.positions.length
    io += p.indices.length
  }
  return { positions, normals, indices }
}

/** Adds a named node with one mesh (positions relative to `pivot`) to a document. */
export function addMeshNode(doc: Document, name: string, data: MeshData, pivot: Vec3, material?: Material): Node {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer()
  const local = new Float32Array(data.positions.length)
  for (let i = 0; i < data.positions.length; i += 3) {
    local[i] = data.positions[i] - pivot[0]
    local[i + 1] = data.positions[i + 1] - pivot[1]
    local[i + 2] = data.positions[i + 2] - pivot[2]
  }
  const position = doc.createAccessor(`${name}_position`).setType('VEC3').setArray(local).setBuffer(buffer)
  const normal = doc.createAccessor(`${name}_normal`).setType('VEC3').setArray(data.normals).setBuffer(buffer)
  const indices = doc.createAccessor(`${name}_indices`).setType('SCALAR').setArray(data.indices).setBuffer(buffer)
  material ??= doc.getRoot().listMaterials()[0] ?? doc.createMaterial('holo')
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setIndices(indices)
    .setMaterial(material)
  const mesh = doc.createMesh(name).addPrimitive(prim)
  return doc.createNode(name).setMesh(mesh).setTranslation(pivot)
}

export function centroid(positions: ArrayLike<number>): Vec3 {
  const c: Vec3 = [0, 0, 0]
  const n = positions.length / 3
  for (let i = 0; i < positions.length; i += 3) {
    c[0] += positions[i]
    c[1] += positions[i + 1]
    c[2] += positions[i + 2]
  }
  return n ? [c[0] / n, c[1] / n, c[2] / n] : c
}

/**
 * Turns a triangle soup (e.g. from STL) into an indexed mesh by merging equal
 * positions, with smooth area-weighted vertex normals.
 */
export function indexSoup(soup: ArrayLike<number>, precision = 1e-6): MeshData {
  const map = new Map<string, number>()
  const positions: number[] = []
  const indices = new Uint32Array(soup.length / 3)
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${Math.round(soup[i] / precision)},${Math.round(soup[i + 1] / precision)},${Math.round(soup[i + 2] / precision)}`
    let index = map.get(key)
    if (index === undefined) {
      index = positions.length / 3
      positions.push(soup[i], soup[i + 1], soup[i + 2])
      map.set(key, index)
    }
    indices[i / 3] = index
  }
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3]
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const k of [a, b, c]) {
      normals[k] += nx
      normals[k + 1] += ny
      normals[k + 2] += nz
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= l
    normals[i + 1] /= l
    normals[i + 2] /= l
  }
  return { positions: new Float32Array(positions), normals, indices }
}

/** Axis-aligned box with optional rotation matrix, as an indexed mesh (flat-shaded faces). */
export function boxMesh(center: Vec3, size: Vec3): MeshData {
  const [cx, cy, cz] = center
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2]
  const faces: [Vec3, Vec3[]][] = [
    [[1, 0, 0], [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]],
    [[-1, 0, 0], [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]]],
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
  ]
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  faces.forEach(([n, quad], f) => {
    quad.forEach(([x, y, z]) => {
      positions.push(cx + x, cy + y, cz + z)
      normals.push(...n)
    })
    const o = f * 4
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3)
  })
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) }
}

/** Cylinder along an axis (0 = x, 1 = y, 2 = z), capped. */
export function cylinderMesh(center: Vec3, radius: number, length: number, axis: 0 | 1 | 2, segments = 16): MeshData {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const place = (a: number, r1: number, r2: number): Vec3 => {
    const p: Vec3 = [0, 0, 0]
    const others = [0, 1, 2].filter((k) => k !== axis)
    p[axis] = a
    p[others[0]] = r1
    p[others[1]] = r2
    return [p[0] + center[0], p[1] + center[1], p[2] + center[2]]
  }
  const dir = (a: number, r1: number, r2: number): Vec3 => {
    const p = place(a, r1, r2)
    return [p[0] - center[0], p[1] - center[1], p[2] - center[2]]
  }
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    for (const a of [-length / 2, length / 2]) {
      positions.push(...place(a, c * radius, s * radius))
      normals.push(...dir(0, c, s))
    }
  }
  for (let i = 0; i < segments; i++) {
    const o = i * 2
    indices.push(o, o + 2, o + 1, o + 1, o + 2, o + 3)
  }
  for (const [a, sign] of [[-length / 2, -1], [length / 2, 1]] as const) {
    const centerIndex = positions.length / 3
    positions.push(...place(a, 0, 0))
    normals.push(...dir(sign, 0, 0))
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2
      positions.push(...place(a, Math.cos(t) * radius, Math.sin(t) * radius))
      normals.push(...dir(sign, 0, 0))
    }
    for (let i = 0; i < segments; i++) {
      const o = centerIndex + 1 + i
      if (sign > 0) indices.push(centerIndex, o, o + 1)
      else indices.push(centerIndex, o + 1, o)
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) }
}

/** Replaces normals with smooth, area-weighted vertex normals (for sources with missing/zero normals). */
export function recomputeNormals(data: MeshData): MeshData {
  const { positions, indices } = data
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3]
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const k of [a, b, c]) {
      normals[k] += nx
      normals[k + 1] += ny
      normals[k + 2] += nz
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= l
    normals[i + 1] /= l
    normals[i + 2] /= l
  }
  return { ...data, normals }
}
