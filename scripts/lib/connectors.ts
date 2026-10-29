// Where parts meet, measured from their meshes: the opening a vessel joins its chamber at, the
// direction it leaves in, and the vessel's centre line from that opening (for blood-flow pulses).
// Builders write the results into the GLB extras; the app reads them in ModelRig.
import type { MeshData, Vec3 } from './gltf'

export interface Junction {
  /** Centre of the contact between the two parts. */
  pos: Vec3
  /** Unit direction from the opening into the attaching part (the way it leaves its parent). */
  normal: Vec3
  /** Gap between the parts in metres (0 when they touch). */
  gap: number
}

const dist = (a: ArrayLike<number>, i: number, b: ArrayLike<number>, j: number) =>
  Math.hypot(a[i * 3] - b[j * 3], a[i * 3 + 1] - b[j * 3 + 1], a[i * 3 + 2] - b[j * 3 + 2])

/** Spatial hash of a mesh's vertices for nearest-vertex queries. */
class Grid {
  private cells = new Map<string, number[]>()
  private readonly p: Float32Array
  private readonly size: number
  constructor(p: Float32Array, size: number) {
    this.p = p
    this.size = size
    for (let i = 0; i < p.length / 3; i++) {
      const k = this.key(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
      ;(this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(i)
    }
  }
  private key(x: number, y: number, z: number) {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)},${Math.floor(z / this.size)}`
  }
  /** Distance from a point to the nearest vertex within one cell ring (Infinity if none). */
  nearest(q: ArrayLike<number>, j: number): number {
    const cx = Math.floor(q[j * 3] / this.size)
    const cy = Math.floor(q[j * 3 + 1] / this.size)
    const cz = Math.floor(q[j * 3 + 2] / this.size)
    let best = Infinity
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let z = cz - 1; z <= cz + 1; z++)
          for (const i of this.cells.get(`${x},${y},${z}`) ?? []) best = Math.min(best, dist(this.p, i, q, j))
    return best
  }
}

const mean = (p: ArrayLike<number>, idx: number[]): Vec3 => {
  const c: Vec3 = [0, 0, 0]
  for (const i of idx) for (let a = 0; a < 3; a++) c[a] += p[i * 3 + a] / idx.length
  return c
}

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * Where `child` meets `parent`: the centroid of the child's vertices that lie within `reach` of the
 * parent. Parts from an atlas rarely touch exactly, so the reach grows until enough vertices qualify;
 * if the parts never come close, the child's vertex nearest the parent is used.
 */
export function junction(child: MeshData, parent: MeshData, reach = 0.0015): Junction {
  const c = child.positions
  const n = c.length / 3
  let contact: number[] = []
  let used = reach
  for (let r = reach; r <= 0.008 && contact.length < 12; r *= 1.6) {
    const grid = new Grid(parent.positions, r)
    contact = []
    for (let j = 0; j < n; j++) if (grid.nearest(c, j) <= r) contact.push(j)
    used = r
  }
  let gap = 0
  if (contact.length < 3) {
    // No contact: take the child's vertex nearest to the parent (brute force over a coarse grid).
    const grid = new Grid(parent.positions, 0.02)
    let best = Infinity
    let at = 0
    for (let j = 0; j < n; j++) {
      const d = grid.nearest(c, j)
      if (d < best) {
        best = d
        at = j
      }
    }
    contact = [at]
    gap = best
  } else {
    gap = used > reach ? used : 0
  }
  const pos = mean(c, contact)
  // The way out: from the opening toward the child's vertices a short distance away.
  const near: number[] = []
  for (let j = 0; j < n; j++) {
    const d = Math.hypot(c[j * 3] - pos[0], c[j * 3 + 1] - pos[1], c[j * 3 + 2] - pos[2])
    if (d > 0.004 && d < 0.012) near.push(j)
  }
  const ahead = near.length
    ? mean(c, near)
    : mean(
        c,
        Array.from({ length: n }, (_, j) => j),
      )
  return { pos, normal: normalize([ahead[0] - pos[0], ahead[1] - pos[1], ahead[2] - pos[2]]), gap }
}

/**
 * A vessel's centre line from `start` (its opening): geodesic distance over the welded mesh, binned
 * into `bins` slices; each slice contributes the centroid of its largest connected piece. Branches
 * beyond the main run are ignored, so the line follows the longest path.
 */
export function centerline(mesh: MeshData, start: Vec3, bins = 12): Vec3[] {
  const P = mesh.positions
  const n = P.length / 3
  // Weld by position.
  const canon = new Int32Array(n)
  const seen = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const k = `${P[i * 3].toFixed(5)},${P[i * 3 + 1].toFixed(5)},${P[i * 3 + 2].toFixed(5)}`
    if (!seen.has(k)) seen.set(k, i)
    canon[i] = seen.get(k)!
  }
  const adj = new Map<number, Set<number>>()
  const link = (a: number, b: number) => {
    a = canon[a]
    b = canon[b]
    if (a === b) return
    ;(adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
    ;(adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a)
  }
  const I = mesh.indices
  for (let t = 0; t < I.length; t += 3) {
    link(I[t], I[t + 1])
    link(I[t + 1], I[t + 2])
    link(I[t + 2], I[t])
  }
  const verts = [...adj.keys()]
  let s0 = verts[0]
  let best = Infinity
  for (const v of verts) {
    const d = Math.hypot(P[v * 3] - start[0], P[v * 3 + 1] - start[1], P[v * 3 + 2] - start[2])
    if (d < best) {
      best = d
      s0 = v
    }
  }

  // Dijkstra with a binary heap.
  const D = new Map<number, number>([[s0, 0]])
  const heap: [number, number][] = [[0, s0]]
  const up = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const down = (i: number) => {
    for (;;) {
      const l = 2 * i + 1
      const r = l + 1
      let m = i
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r
      if (m === i) return
      ;[heap[m], heap[i]] = [heap[i], heap[m]]
      i = m
    }
  }
  while (heap.length) {
    const [d, v] = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      down(0)
    }
    if (d > (D.get(v) ?? Infinity)) continue
    for (const w of adj.get(v)!) {
      const nd = d + dist(P, v, P, w)
      if (nd < (D.get(w) ?? Infinity)) {
        D.set(w, nd)
        heap.push([nd, w])
        up(heap.length - 1)
      }
    }
  }

  const reached = verts.filter((v) => D.has(v))
  const maxD = Math.max(...reached.map((v) => D.get(v)!))
  const slices: number[][] = Array.from({ length: bins }, () => [])
  for (const v of reached) slices[Math.min(bins - 1, Math.floor((D.get(v)! / maxD) * bins))].push(v)

  const line: Vec3[] = [start]
  for (const slice of slices) {
    if (!slice.length) continue
    // Largest connected piece of the slice (a vessel wall ring), so side branches don't pull it off.
    const inSlice = new Set(slice)
    const label = new Map<number, number>()
    const sizes: number[] = []
    for (const v of slice) {
      if (label.has(v)) continue
      const id = sizes.length
      let size = 0
      const stack = [v]
      label.set(v, id)
      while (stack.length) {
        const x = stack.pop()!
        size++
        for (const w of adj.get(x)!) {
          if (inSlice.has(w) && !label.has(w)) {
            label.set(w, id)
            stack.push(w)
          }
        }
      }
      sizes.push(size)
    }
    const biggest = sizes.indexOf(Math.max(...sizes))
    const members = slice.filter((v) => label.get(v) === biggest)
    if (members.length >= 6) line.push(mean(P, members))
  }
  return line.map((p) => p.map((x) => +x.toFixed(5)) as Vec3)
}
