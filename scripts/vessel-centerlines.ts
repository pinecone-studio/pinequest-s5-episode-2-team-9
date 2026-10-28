// Measures vessel centre lines in a GLB, for the blood-flow paths in
// src/scene/motion/heartCirculation.ts. Walks the mesh from one end (geodesic
// distance), bins the vertices along the way and prints each bin's centre and radius;
// with a reference point it also lists each separate piece's near and far ends.
// Usage: npx tsx scripts/vessel-centerlines.ts <glb> <part> <+y|-y|near:x,y,z> [bins] [refX,refY,refZ]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { worldMeshData } from './lib/gltf'

const [file, partName, start, binsArg] = process.argv.slice(2)
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(file)
const node = doc.getRoot().listNodes().find((n) => n.getName() === partName)!
const data = worldMeshData(node)
const P = data.positions
const n = P.length / 3

// Weld by position.
const key = (i: number) => `${P[i * 3].toFixed(5)},${P[i * 3 + 1].toFixed(5)},${P[i * 3 + 2].toFixed(5)}`
const canon = new Int32Array(n)
const seen = new Map<string, number>()
for (let i = 0; i < n; i++) {
  const k = key(i)
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
const I = data.indices
for (let t = 0; t < I.length; t += 3) {
  link(I[t], I[t + 1])
  link(I[t + 1], I[t + 2])
  link(I[t + 2], I[t])
}
const verts = [...adj.keys()]
const pos = (i: number) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

let s0 = verts[0]
if (start.startsWith('near:')) {
  const t = start.slice(5).split(',').map(Number)
  let best = Infinity
  for (const v of verts) {
    const d = dist(pos(v), t)
    if (d < best) {
      best = d
      s0 = v
    }
  }
} else {
  const axis = { x: 0, y: 1, z: 2 }[start[1] as 'x' | 'y' | 'z']
  const sign = start[0] === '-' ? -1 : 1
  let best = -Infinity
  for (const v of verts) {
    const val = sign * P[v * 3 + axis]
    if (val > best) {
      best = val
      s0 = v
    }
  }
}

// Dijkstra (simple binary heap).
const D = new Map<number, number>()
const heap: [number, number][] = [[0, s0]]
D.set(s0, 0)
const push = (item: [number, number]) => {
  heap.push(item)
  let i = heap.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (heap[p][0] <= heap[i][0]) break
    ;[heap[p], heap[i]] = [heap[i], heap[p]]
    i = p
  }
}
const pop = () => {
  const top = heap[0]
  const last = heap.pop()!
  if (heap.length) {
    heap[0] = last
    let i = 0
    for (;;) {
      const l = 2 * i + 1
      const r = l + 1
      let m = i
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r
      if (m === i) break
      ;[heap[m], heap[i]] = [heap[i], heap[m]]
      i = m
    }
  }
  return top
}
while (heap.length) {
  const [d, v] = pop()
  if (d > (D.get(v) ?? Infinity)) continue
  for (const w of adj.get(v)!) {
    const nd = d + dist(pos(v), pos(w))
    if (nd < (D.get(w) ?? Infinity)) {
      D.set(w, nd)
      push([nd, w])
    }
  }
}
const reached = verts.filter((v) => D.has(v))
const maxD = Math.max(...reached.map((v) => D.get(v)!))
const bins = Number(binsArg ?? 14)
const groups: number[][] = Array.from({ length: bins }, () => [])
for (const v of reached) groups[Math.min(bins - 1, Math.floor((D.get(v)! / maxD) * bins))].push(v)

// Per bin: split into spatial clusters (single linkage at a threshold), report centroids.
const out: { bin: number; clusters: { c: number[]; r: number; n: number }[] }[] = []
for (let b = 0; b < bins; b++) {
  const g = groups[b]
  if (!g.length) continue
  const label = new Map<number, number>()
  const inBin = new Set(g)
  let next = 0
  for (const v of g) {
    if (label.has(v)) continue
    const stack = [v]
    label.set(v, next)
    while (stack.length) {
      const x = stack.pop()!
      for (const w of adj.get(x)!) if (inBin.has(w) && !label.has(w)) {
        label.set(w, next)
        stack.push(w)
      }
    }
    next++
  }
  const clusters: { c: number[]; r: number; n: number }[] = []
  for (let k = 0; k < next; k++) {
    const members = g.filter((v) => label.get(v) === k)
    if (members.length < 12) continue
    const c = [0, 1, 2].map((a) => members.reduce((s, v) => s + P[v * 3 + a], 0) / members.length)
    const r = members.reduce((s, v) => s + dist(pos(v), c), 0) / members.length
    clusters.push({ c: c.map((x) => +x.toFixed(4)), r: +r.toFixed(4), n: members.length })
  }
  out.push({ bin: b, clusters })
}
console.log(partName, 'verts', verts.length, 'reached', reached.length, 'start', pos(s0).map((x) => +x.toFixed(4)), 'maxGeo', maxD.toFixed(3))
for (const o of out) console.log(o.bin, o.clusters.map((c) => `[${c.c.join(',')}] r${c.r} n${c.n}`).join('  |  '))

// Components: for each connected piece, its centroid and the vertices nearest/farthest from a reference point.
if (process.argv[6]) {
  const ref = process.argv[6].split(',').map(Number)
  const comp = new Map<number, number>()
  let k = 0
  for (const v of verts) {
    if (comp.has(v)) continue
    const stack = [v]
    comp.set(v, k)
    while (stack.length) {
      const x = stack.pop()!
      for (const w of adj.get(x)!) if (!comp.has(w)) {
        comp.set(w, k)
        stack.push(w)
      }
    }
    k++
  }
  for (let c = 0; c < k; c++) {
    const m = verts.filter((v) => comp.get(v) === c)
    if (m.length < 30) continue
    const cen = [0, 1, 2].map((a) => m.reduce((s, v) => s + P[v * 3 + a], 0) / m.length)
    const byRef = [...m].sort((a, b) => dist(pos(a), ref) - dist(pos(b), ref))
    // Mean of the nearest/farthest 5% gives stable end points.
    const avg = (vs: number[]) => [0, 1, 2].map((a) => +(vs.reduce((s, v) => s + P[v * 3 + a], 0) / vs.length).toFixed(4))
    const q = Math.max(5, Math.floor(m.length * 0.05))
    console.log(`comp ${c} n${m.length} centroid ${cen.map((x) => x.toFixed(4))} near ${avg(byRef.slice(0, q))} far ${avg(byRef.slice(-q))}`)
  }
}
