// Voxel tools for organ models built as volumes (Node only): fill a closed (or
// nearly closed) surface, split the volume into regions by geodesic distance from
// labelled seeds, and turn regions back into smooth closed meshes (surface nets).
import { recomputeNormals, type MeshData, type Vec3 } from './gltf'

/** Regular grid of cubic voxels; voxel (i, j, k) is centred at min + (i + 0.5) h. */
export class Grid {
  readonly min: Vec3
  readonly h: number
  readonly nx: number
  readonly ny: number
  readonly nz: number

  constructor(min: Vec3, h: number, nx: number, ny: number, nz: number) {
    this.min = min
    this.h = h
    this.nx = nx
    this.ny = ny
    this.nz = nz
  }

  /** A grid covering a box with `pad` voxels of margin. */
  static around(min: Vec3, max: Vec3, h: number, pad = 3): Grid {
    const o: Vec3 = [min[0] - pad * h, min[1] - pad * h, min[2] - pad * h]
    const n = [0, 1, 2].map((a) => Math.ceil((max[a] - min[a]) / h) + 2 * pad)
    return new Grid(o, h, n[0], n[1], n[2])
  }

  get size(): number {
    return this.nx * this.ny * this.nz
  }

  index(i: number, j: number, k: number): number {
    return i + this.nx * (j + this.ny * k)
  }

  /** Voxel coordinates of a flat index. */
  ijk(v: number): [number, number, number] {
    const i = v % this.nx
    const r = (v - i) / this.nx
    const j = r % this.ny
    return [i, j, (r - j) / this.ny]
  }

  centre(v: number): Vec3 {
    const [i, j, k] = this.ijk(v)
    const h = this.h
    return [this.min[0] + (i + 0.5) * h, this.min[1] + (j + 0.5) * h, this.min[2] + (k + 0.5) * h]
  }

  /** Flat index of the voxel holding a point, or -1 outside the grid. */
  voxelAt(x: number, y: number, z: number): number {
    const i = Math.floor((x - this.min[0]) / this.h)
    const j = Math.floor((y - this.min[1]) / this.h)
    const k = Math.floor((z - this.min[2]) / this.h)
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return -1
    return this.index(i, j, k)
  }
}

/** Marks (sets to `value`) every voxel a mesh's triangles pass through. */
export function rasterize(grid: Grid, mesh: MeshData, out: Uint8Array | Int16Array, value = 1): void {
  const P = mesh.positions
  const I = mesh.indices
  const step = grid.h * 0.45
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3
    const b = I[t + 1] * 3
    const c = I[t + 2] * 3
    const lab = Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2])
    const lac = Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2])
    const lbc = Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2])
    const n = Math.max(1, Math.ceil(Math.max(lab, lac, lbc) / step))
    for (let u = 0; u <= n; u++) {
      for (let w = 0; u + w <= n; w++) {
        const fu = u / n
        const fw = w / n
        const fv = 1 - fu - fw
        const v = grid.voxelAt(
          P[a] * fv + P[b] * fu + P[c] * fw,
          P[a + 1] * fv + P[b + 1] * fu + P[c + 1] * fw,
          P[a + 2] * fv + P[b + 2] * fu + P[c + 2] * fw,
        )
        if (v >= 0) out[v] = value
      }
    }
  }
}

/** Grows a mask by `r` voxels (6-connected steps). */
export function dilate(grid: Grid, mask: Uint8Array, r: number): Uint8Array {
  let cur = mask
  for (let s = 0; s < r; s++) {
    const next = cur.slice()
    forEachNeighbour6(grid, cur, (v, w) => {
      next[w] = 1
      void v
    })
    cur = next
  }
  return cur
}

/** Shrinks a mask by `r` voxels. */
export function erode(grid: Grid, mask: Uint8Array, r: number): Uint8Array {
  let cur = mask
  for (let s = 0; s < r; s++) {
    const inv = cur.map((x) => (x ? 0 : 1))
    const grown = dilate(grid, inv, 1)
    cur = cur.map((x, i) => (x && !grown[i] ? 1 : 0))
  }
  return cur
}

function forEachNeighbour6(grid: Grid, mask: Uint8Array, fn: (v: number, w: number) => void) {
  const { nx, ny, nz } = grid
  const sy = nx
  const sz = nx * ny
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v = i + sy * j + sz * k
        if (!mask[v]) continue
        if (i > 0) fn(v, v - 1)
        if (i < nx - 1) fn(v, v + 1)
        if (j > 0) fn(v, v - sy)
        if (j < ny - 1) fn(v, v + sy)
        if (k > 0) fn(v, v - sz)
        if (k < nz - 1) fn(v, v + sz)
      }
}

/** The solid enclosed by a wall mask: everything the outside cannot reach (wall included). */
export function fillInside(grid: Grid, wall: Uint8Array): Uint8Array {
  const { nx, ny, nz } = grid
  const outside = new Uint8Array(grid.size)
  const queue = new Int32Array(grid.size)
  let head = 0
  let tail = 0
  const push = (v: number) => {
    if (!wall[v] && !outside[v]) {
      outside[v] = 1
      queue[tail++] = v
    }
  }
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) push(grid.index(i, j, k))
  const sy = nx
  const sz = nx * ny
  while (head < tail) {
    const v = queue[head++]
    const i = v % nx
    const j = ((v - i) / nx) % ny
    const k = Math.floor(v / sz)
    if (i > 0) push(v - 1)
    if (i < nx - 1) push(v + 1)
    if (j > 0) push(v - sy)
    if (j < ny - 1) push(v + sy)
    if (k > 0) push(v - sz)
    if (k < nz - 1) push(v + sz)
  }
  return outside.map((o) => (o ? 0 : 1))
}

/**
 * Splits a domain into regions: each voxel takes the label of the seed it is
 * geodesically nearest to, walking only through the domain (26-neighbour steps).
 * `labels` holds seed labels (>= 0) and -1 elsewhere; it is filled in place.
 * Dial's bucket queue with integer step costs (10, 14, 17 ≈ 1, √2, √3).
 */
export function growLabels(grid: Grid, domain: Uint8Array, labels: Int16Array): Int16Array {
  const { nx, ny, nz } = grid
  const dist = new Int32Array(grid.size).fill(0x7fffffff)
  const offsets: { d: number; di: number; dj: number; dk: number; cost: number }[] = []
  for (let dk = -1; dk <= 1; dk++)
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const m = Math.abs(di) + Math.abs(dj) + Math.abs(dk)
        if (!m) continue
        offsets.push({ d: di + nx * (dj + ny * dk), di, dj, dk, cost: m === 1 ? 10 : m === 2 ? 14 : 17 })
      }
  const B = 18
  const buckets: number[][] = Array.from({ length: B }, () => [])
  let pending = 0
  for (let v = 0; v < grid.size; v++) {
    if (labels[v] >= 0 && domain[v]) {
      dist[v] = 0
      buckets[0].push(v)
      pending++
    } else if (!domain[v]) labels[v] = -1
  }
  let d = 0
  while (pending > 0) {
    const bucket = buckets[d % B]
    while (bucket.length) {
      const v = bucket.pop()!
      pending--
      if (dist[v] !== d) continue
      const i = v % nx
      const j = ((v - i) / nx) % ny
      const k = Math.floor(v / (nx * ny))
      for (const o of offsets) {
        const ii = i + o.di
        const jj = j + o.dj
        const kk = k + o.dk
        if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue
        const w = v + o.d
        if (!domain[w]) continue
        const nd = d + o.cost
        if (nd < dist[w]) {
          dist[w] = nd
          labels[w] = labels[v]
          buckets[nd % B].push(w)
          pending++
        }
      }
    }
    d++
  }
  return labels
}

/** Separable Gaussian blur of a scalar field (in place, returns it). */
export function blur(nx: number, ny: number, nz: number, f: Float32Array, sigma: number): Float32Array {
  if (sigma <= 0) return f
  const r = Math.max(1, Math.ceil(sigma * 2.5))
  const kernel = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)))
  const sum = kernel.reduce((a, b) => a + b, 0)
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum
  const strides = [1, nx, nx * ny]
  const dims = [nx, ny, nz]
  const line = new Float32Array(Math.max(nx, ny, nz))
  for (let axis = 0; axis < 3; axis++) {
    const n = dims[axis]
    const s = strides[axis]
    const [a1, a2] = [0, 1, 2].filter((a) => a !== axis)
    for (let q = 0; q < dims[a2]; q++)
      for (let p = 0; p < dims[a1]; p++) {
        const base = p * strides[a1] + q * strides[a2]
        for (let t = 0; t < n; t++) line[t] = f[base + t * s]
        for (let t = 0; t < n; t++) {
          let acc = 0
          for (let m = -r; m <= r; m++) acc += kernel[m + r] * line[Math.min(n - 1, Math.max(0, t + m))]
          f[base + t * s] = acc
        }
      }
  }
  return f
}

export interface FieldBox {
  /** World position of sample (0, 0, 0). */
  origin: Vec3
  h: number
  nx: number
  ny: number
  nz: number
  values: Float32Array
}

/** Naive surface nets: a closed, smooth-ready mesh of the level set `values > iso`. */
export function surfaceNets(box: FieldBox, iso: number): MeshData {
  const { nx, ny, nz, values: f, h, origin } = box
  const at = (i: number, j: number, k: number) => f[i + nx * (j + ny * k)]
  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cid = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k)
  const positions: number[] = []
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ]
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  const val = new Float32Array(8)
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0
        for (let c = 0; c < 8; c++) {
          val[c] = at(i + corners[c][0], j + corners[c][1], k + corners[c][2]) - iso
          if (val[c] > 0) mask |= 1 << c
        }
        if (mask === 0 || mask === 255) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let n = 0
        for (const [a, b] of edges) {
          if (val[a] > 0 === val[b] > 0) continue
          const t = val[a] / (val[a] - val[b])
          sx += corners[a][0] + t * (corners[b][0] - corners[a][0])
          sy += corners[a][1] + t * (corners[b][1] - corners[a][1])
          sz += corners[a][2] + t * (corners[b][2] - corners[a][2])
          n++
        }
        cellIndex[cid(i, j, k)] = positions.length / 3
        positions.push(origin[0] + (i + sx / n) * h, origin[1] + (j + sy / n) * h, origin[2] + (k + sz / n) * h)
      }
  const indices: number[] = []
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) indices.push(a, c, b, a, d, c)
    else indices.push(a, b, c, a, c, d)
  }
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const inside = at(i, j, k) > iso
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 && inside !== at(i + 1, j, k) > iso)
          quad(cellIndex[cid(i, j - 1, k - 1)], cellIndex[cid(i, j, k - 1)], cellIndex[cid(i, j, k)], cellIndex[cid(i, j - 1, k)], !inside)
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 && inside !== at(i, j + 1, k) > iso)
          quad(cellIndex[cid(i - 1, j, k - 1)], cellIndex[cid(i - 1, j, k)], cellIndex[cid(i, j, k)], cellIndex[cid(i, j, k - 1)], !inside)
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && inside !== at(i, j, k + 1) > iso)
          quad(cellIndex[cid(i - 1, j - 1, k)], cellIndex[cid(i, j - 1, k)], cellIndex[cid(i, j, k)], cellIndex[cid(i - 1, j, k)], !inside)
      }
  const mesh: MeshData = {
    positions: new Float32Array(positions),
    normals: new Float32Array(positions.length),
    indices: new Uint32Array(indices),
  }
  if (signedVolume(mesh) < 0) {
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const x = mesh.indices[t + 1]
      mesh.indices[t + 1] = mesh.indices[t + 2]
      mesh.indices[t + 2] = x
    }
  }
  return recomputeNormals(mesh)
}

export function signedVolume(mesh: MeshData): number {
  const P = mesh.positions
  const I = mesh.indices
  let vol = 0
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3
    const b = I[t + 1] * 3
    const c = I[t + 2] * 3
    vol +=
      (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) -
        P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) +
        P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) /
      6
  }
  return vol
}

/** Taubin smoothing (shrink-free Laplacian), then fresh normals. */
export function smoothMesh(mesh: MeshData, iterations = 10, lambda = 0.5, mu = -0.53): MeshData {
  const n = mesh.positions.length / 3
  const nbr: number[][] = Array.from({ length: n }, () => [])
  const I = mesh.indices
  for (let t = 0; t < I.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = I[t + e]
      const b = I[t + ((e + 1) % 3)]
      if (!nbr[a].includes(b)) nbr[a].push(b)
      if (!nbr[b].includes(a)) nbr[b].push(a)
    }
  let p = mesh.positions.slice()
  const step = (k: number) => {
    const q = p.slice()
    for (let v = 0; v < n; v++) {
      const ns = nbr[v]
      if (!ns.length) continue
      let x = 0
      let y = 0
      let z = 0
      for (const w of ns) {
        x += p[w * 3]
        y += p[w * 3 + 1]
        z += p[w * 3 + 2]
      }
      const m = ns.length
      q[v * 3] += k * (x / m - p[v * 3])
      q[v * 3 + 1] += k * (y / m - p[v * 3 + 1])
      q[v * 3 + 2] += k * (z / m - p[v * 3 + 2])
    }
    p = q
  }
  for (let s = 0; s < iterations; s++) {
    step(lambda)
    step(mu)
  }
  return recomputeNormals({ ...mesh, positions: p })
}

export interface RegionMeshOptions {
  /** Gaussian blur of the region's indicator, in voxels (rounds off the voxel steps). */
  blur?: number
  /** Iso level of the blurred indicator: 0.5 = on the boundary, higher = slightly shrunk (leaves a seam). */
  iso?: number
  smooth?: number
}

/** Smooth closed mesh of the voxels for which `inRegion(label)` holds. */
export function regionMesh(
  grid: Grid,
  labels: Int16Array | Uint8Array,
  inRegion: (label: number) => boolean,
  options: RegionMeshOptions = {},
): MeshData {
  const { blur: sigma = 1, iso = 0.5, smooth = 8 } = options
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < grid.size; v++) {
    if (!inRegion(labels[v])) continue
    const c = grid.ijk(v)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], c[a])
      hi[a] = Math.max(hi[a], c[a])
    }
  }
  if (lo[0] === Infinity) throw new Error('regionMesh: empty region')
  const pad = Math.ceil(sigma * 3) + 2
  const nx = hi[0] - lo[0] + 1 + 2 * pad
  const ny = hi[1] - lo[1] + 1 + 2 * pad
  const nz = hi[2] - lo[2] + 1 + 2 * pad
  const values = new Float32Array(nx * ny * nz)
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const gi = i + lo[0] - pad
        const gj = j + lo[1] - pad
        const gk = k + lo[2] - pad
        if (gi < 0 || gj < 0 || gk < 0 || gi >= grid.nx || gj >= grid.ny || gk >= grid.nz) continue
        if (inRegion(labels[grid.index(gi, gj, gk)])) values[i + nx * (j + ny * k)] = 1
      }
  blur(nx, ny, nz, values, sigma)
  const h = grid.h
  const origin: Vec3 = [
    grid.min[0] + (lo[0] - pad + 0.5) * h,
    grid.min[1] + (lo[1] - pad + 0.5) * h,
    grid.min[2] + (lo[2] - pad + 0.5) * h,
  ]
  const mesh = surfaceNets({ origin, h, nx, ny, nz, values }, iso)
  return smooth ? smoothMesh(mesh, smooth) : mesh
}

/** Small deterministic random generator (mulberry32), so builds are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Poisson-disk sample of voxels: no two picks closer than `spacing` (world units). */
export function poissonVoxels(grid: Grid, voxels: number[], spacing: number, random: () => number): number[] {
  const order = voxels.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const cell = spacing
  const hash = new Map<string, Vec3[]>()
  const keyOf = (p: Vec3) => p.map((x) => Math.floor(x / cell))
  const picks: number[] = []
  for (const v of order) {
    const p = grid.centre(v)
    const [cx, cy, cz] = keyOf(p)
    let ok = true
    for (let dz = -1; dz <= 1 && ok; dz++)
      for (let dy = -1; dy <= 1 && ok; dy++)
        for (let dx = -1; dx <= 1 && ok; dx++)
          for (const q of hash.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? [])
            if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < spacing) {
              ok = false
              break
            }
    if (!ok) continue
    picks.push(v)
    const k = `${cx},${cy},${cz}`
    ;(hash.get(k) ?? hash.set(k, []).get(k)!).push(p)
  }
  return picks
}
