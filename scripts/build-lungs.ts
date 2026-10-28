// Builds public/models/lungs.glb (and src/models/lungs/airways.json, the air paths
// for the breathing motion) from the Human Reference Atlas (HuBMAP) Visible Human
// Male lung and blood vasculature reference organs (CC BY 4.0). Both share the
// heart's frame (metres, +x = patient's left, +y up, +z anterior).
//
// The atlas gives the lung surface split into its 18 bronchopulmonary segments
// (open surface patches), the lobar and segmental bronchi with their cartilage,
// and the pulmonary vessels at the hilum. From these this script:
//   - fills each lung as a voxel volume and splits it into solid segments: every
//     voxel goes to the segment whose pleural patch or segmental bronchus is
//     geodesically nearest (a segment is the lung supplied by one bronchus);
//   - splits every segment into secondary pulmonary lobules (the smallest piece of
//     lung walled off by connective-tissue septa, 1-2.5 cm) the same way;
//   - models what the atlas lacks: the trachea and main bronchi (C-shaped cartilage
//     rings, trachealis muscle, annular ligaments, mucosa) and the diaphragm (domes
//     fitted under the lung bases, central tendon, crura, the caval, oesophageal and
//     aortic openings);
//   - traces the centre lines of the whole airway tree for the air flow.
//
// Usage: npx tsx scripts/build-lungs.ts
import { NodeIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { boundsOf, centroid, mergeMeshData, worldMeshData, type MeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb, type OutputPart, type OutputPiece } from './lib/output'
import { fillInside, Grid, growLabels, poissonVoxels, rasterize, regionMesh, rng } from './lib/voxel'

const CACHE = 'scripts/.cache'
const SOURCES = {
  lung: {
    url: 'https://cdn.humanatlas.io/digital-objects/ref-organ/lung-male/v1.3/assets/3d-vh-m-lung.glb',
    file: `${CACHE}/lung-male.glb`,
  },
  vessels: {
    url: 'https://cdn.humanatlas.io/digital-objects/ref-organ/blood-vasculature-male/latest/assets/3d-vh-m-blood-vasculature.glb',
    file: `${CACHE}/vasculature-male.glb`,
  },
}

/** Voxel size of the lung volumes. */
const H = 0.00125
/** Spacing of secondary pulmonary lobules (their size is 1-2.5 cm). */
const LOBULE_SPACING = 0.024

type Side = 'right' | 'left'
type LobeId = 'right_upper_lobe' | 'right_middle_lobe' | 'right_lower_lobe' | 'left_upper_lobe' | 'left_lower_lobe'

interface SegmentSpec {
  /** Piece id inside its lobe. */
  id: string
  lobe: LobeId
  /** Atlas surface patch (pleural surface of the segment). */
  patch: string
  /** Atlas segmental bronchus supplying it (shared by two segments = split between them). */
  bronchus: string
}

// The 18 segments (Boyden numbering in comments). Atlas node names minus "VH_M_".
const SEGMENTS: SegmentSpec[] = [
  { id: 'apical', lobe: 'right_upper_lobe', patch: 'right_apical_bronchopulmonary_segment', bronchus: 'right_apical_bronchus' }, // S1
  { id: 'posterior', lobe: 'right_upper_lobe', patch: 'right_posterior_bronchopulmonary_segment', bronchus: 'right_posterior_bronchus' }, // S2
  { id: 'anterior', lobe: 'right_upper_lobe', patch: 'right_anterior_bronchopulmonary_segment', bronchus: 'right_anterior_bronchus' }, // S3
  { id: 'lateral', lobe: 'right_middle_lobe', patch: 'right_lateral_bronchopulmonary_segment', bronchus: 'right_lateral_bronchus' }, // S4
  { id: 'medial', lobe: 'right_middle_lobe', patch: 'right_medial_bronchopulmonary_segment', bronchus: 'right_medial_bronchus' }, // S5
  { id: 'superior', lobe: 'right_lower_lobe', patch: 'right_superior_bronchopulmonary_segment', bronchus: 'right_superior_bronchus' }, // S6
  { id: 'medial_basal', lobe: 'right_lower_lobe', patch: 'right_medial_basal_bronchopulmonary_segment', bronchus: 'right_medial_basal_bronchus' }, // S7
  { id: 'anterior_basal', lobe: 'right_lower_lobe', patch: 'right_anterior_basal_bronchopulmonary_segment', bronchus: 'right_anterior_basal_bronchus' }, // S8
  { id: 'lateral_basal', lobe: 'right_lower_lobe', patch: 'right_lateral_basal_bronchopulmonary_segment', bronchus: 'right_lateral_basal_bronchus' }, // S9
  { id: 'posterior_basal', lobe: 'right_lower_lobe', patch: 'right_posterior_basal_bronchopulmonary_segment', bronchus: 'right_posterior_basal' }, // S10
  // Left upper lobe: one apicoposterior bronchus (B1+2) serves both the apical and posterior segments.
  { id: 'apical', lobe: 'left_upper_lobe', patch: 'left_apical_bronchopulmonary_segment', bronchus: 'left_apical_bronchus' }, // S1
  { id: 'posterior', lobe: 'left_upper_lobe', patch: 'left_posterior_bronchopulmonary_segment', bronchus: 'left_apical_bronchus' }, // S2
  { id: 'anterior', lobe: 'left_upper_lobe', patch: 'left_anterior_bronchopulmonary_segment', bronchus: 'left_anterior_bronchus' }, // S3
  { id: 'superior_lingular', lobe: 'left_upper_lobe', patch: 'left_lingula_superior_bronchopulmonary_segment', bronchus: 'left_lingula_superior_bronchus' }, // S4
  { id: 'inferior_lingular', lobe: 'left_upper_lobe', patch: 'left_lingula_inferior_bronchopulmonary_segment', bronchus: 'left_lingula_inferior_bronchus' }, // S5
  { id: 'superior', lobe: 'left_lower_lobe', patch: 'left_superior_bronchopulmonary_segment', bronchus: 'left_superior_bronchus' }, // S6
  { id: 'medial_basal', lobe: 'left_lower_lobe', patch: 'left_medial_basal_bronchopulmonary_segment', bronchus: 'left_medial_basal_bronchus' }, // S7
  { id: 'anterior_basal', lobe: 'left_lower_lobe', patch: 'left_anterior_basal_bronchopulmonary_segment', bronchus: 'left_anterior_basal_bronchus' }, // S8
  { id: 'lateral_basal', lobe: 'left_lower_lobe', patch: 'left_lateral_basal_bronchopulmonary_segment', bronchus: 'left_lateral_basal_bronchus' }, // S9
  { id: 'posterior_basal', lobe: 'left_lower_lobe', patch: 'left_posetrior_basal_bronchopulmonary_segment', bronchus: 'left_posterior_basal_bronchus' }, // S10
]

const LOBES: { id: LobeId; side: Side }[] = [
  { id: 'right_upper_lobe', side: 'right' },
  { id: 'right_middle_lobe', side: 'right' },
  { id: 'right_lower_lobe', side: 'right' },
  { id: 'left_upper_lobe', side: 'left' },
  { id: 'left_lower_lobe', side: 'left' },
]

/** One airway of the bronchial tree: a piece id, its atlas mesh(es), and what it branches from. */
interface AirwaySpec {
  id: string
  side: Side
  meshes: string[]
  parent: string
}

const AIRWAYS: AirwaySpec[] = [
  { id: 'upper_lobe_bronchus', side: 'right', meshes: ['right_superior_lobar_bronchus'], parent: 'main_bronchus' },
  { id: 'intermediate_bronchus', side: 'right', meshes: ['right_intermediate_bronchus'], parent: 'main_bronchus' },
  { id: 'middle_lobe_bronchus', side: 'right', meshes: ['right_middle_lobar_bronchus'], parent: 'intermediate_bronchus' },
  // The atlas's unnamed small "bronchus" branches off the lower lobe bronchus.
  { id: 'lower_lobe_bronchus', side: 'right', meshes: ['right_lower_lobar_bronchus', 'bronchus'], parent: 'intermediate_bronchus' },
  { id: 'apical_bronchus', side: 'right', meshes: ['right_apical_bronchus'], parent: 'upper_lobe_bronchus' },
  { id: 'posterior_bronchus', side: 'right', meshes: ['right_posterior_bronchus'], parent: 'upper_lobe_bronchus' },
  { id: 'anterior_bronchus', side: 'right', meshes: ['right_anterior_bronchus'], parent: 'upper_lobe_bronchus' },
  { id: 'lateral_bronchus', side: 'right', meshes: ['right_lateral_bronchus'], parent: 'middle_lobe_bronchus' },
  { id: 'medial_bronchus', side: 'right', meshes: ['right_medial_bronchus'], parent: 'middle_lobe_bronchus' },
  { id: 'superior_bronchus', side: 'right', meshes: ['right_superior_bronchus'], parent: 'lower_lobe_bronchus' },
  { id: 'medial_basal_bronchus', side: 'right', meshes: ['right_medial_basal_bronchus'], parent: 'lower_lobe_bronchus' },
  { id: 'anterior_basal_bronchus', side: 'right', meshes: ['right_anterior_basal_bronchus'], parent: 'lower_lobe_bronchus' },
  { id: 'lateral_basal_bronchus', side: 'right', meshes: ['right_lateral_basal_bronchus'], parent: 'lower_lobe_bronchus' },
  { id: 'posterior_basal_bronchus', side: 'right', meshes: ['right_posterior_basal'], parent: 'lower_lobe_bronchus' },
  { id: 'upper_lobe_bronchus', side: 'left', meshes: ['left_superior_lobar_bronchus'], parent: 'main_bronchus' },
  { id: 'lower_lobe_bronchus', side: 'left', meshes: ['left_inferior_lobar_bronchus'], parent: 'main_bronchus' },
  { id: 'apicoposterior_bronchus', side: 'left', meshes: ['left_apical_bronchus'], parent: 'upper_lobe_bronchus' },
  { id: 'anterior_bronchus', side: 'left', meshes: ['left_anterior_bronchus'], parent: 'upper_lobe_bronchus' },
  { id: 'lingular_bronchus', side: 'left', meshes: ['left_lingular_bronchus'], parent: 'upper_lobe_bronchus' },
  { id: 'superior_lingular_bronchus', side: 'left', meshes: ['left_lingula_superior_bronchus'], parent: 'lingular_bronchus' },
  { id: 'inferior_lingular_bronchus', side: 'left', meshes: ['left_lingula_inferior_bronchus'], parent: 'lingular_bronchus' },
  { id: 'superior_bronchus', side: 'left', meshes: ['left_superior_bronchus'], parent: 'lower_lobe_bronchus' },
  { id: 'medial_basal_bronchus', side: 'left', meshes: ['left_medial_basal_bronchus'], parent: 'lower_lobe_bronchus' },
  { id: 'anterior_basal_bronchus', side: 'left', meshes: ['left_anterior_basal_bronchus'], parent: 'lower_lobe_bronchus' },
  { id: 'lateral_basal_bronchus', side: 'left', meshes: ['left_lateral_basal_bronchus'], parent: 'lower_lobe_bronchus' },
  { id: 'posterior_basal_bronchus', side: 'left', meshes: ['left_posterior_basal_bronchus'], parent: 'lower_lobe_bronchus' },
]

const CARTILAGE: Record<Side, string[]> = {
  right: ['cartilage_of_the_lobar_bronchus_R', 'cartilage_of_the_tertiary_bronchus_R'],
  left: ['cartilage_of_the_lobar_bronchus_L', 'cartilage_of_the_tertiary_bronchus_L'],
}

const t0 = Date.now()
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a)
const exists = (p: string) => stat(p).then(() => true, () => false)

async function fetchSource(url: string, file: string) {
  if (await exists(file)) return
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
}

await mkdir(CACHE, { recursive: true })
await fetchSource(SOURCES.lung.url, SOURCES.lung.file)
await fetchSource(SOURCES.vessels.url, SOURCES.vessels.file)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const docs = { lung: await io.read(SOURCES.lung.file), vessels: await io.read(SOURCES.vessels.file) }

function atlas(doc: Document, name: string): MeshData {
  const node = doc.getRoot().listNodes().find((n) => n.getName() === `VH_M_${name}`)
  if (!node?.getMesh()) throw new Error(`Atlas node not found: ${name}`)
  return worldMeshData(node)
}
const lungMesh = (name: string) => atlas(docs.lung, name)

// ---------------------------------------------------------------------------
// Small geometry helpers
// ---------------------------------------------------------------------------

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1))
const dist = (a: Vec3, b: Vec3) => len(sub(a, b))
const vertex = (m: MeshData, i: number): Vec3 => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]
const round = (v: Vec3, d = 5): Vec3 => v.map((x) => +x.toFixed(d)) as Vec3

/** Connected pieces of a mesh (by shared positions). */
function components(mesh: MeshData): MeshData[] {
  const n = mesh.positions.length / 3
  const key = (i: number) => `${mesh.positions[i * 3].toFixed(6)},${mesh.positions[i * 3 + 1].toFixed(6)},${mesh.positions[i * 3 + 2].toFixed(6)}`
  const canon = new Map<string, number>()
  const c = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const k = key(i)
    if (!canon.has(k)) canon.set(k, i)
    c[i] = canon.get(k)!
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const I = mesh.indices
  for (let t = 0; t < I.length; t += 3) {
    parent[find(c[I[t]])] = find(c[I[t + 1]])
    parent[find(c[I[t + 1]])] = find(c[I[t + 2]])
  }
  const groups = new Map<number, number[]>()
  for (let t = 0; t < I.length; t += 3) {
    const r = find(c[I[t]])
    ;(groups.get(r) ?? groups.set(r, []).get(r)!).push(t / 3)
  }
  return [...groups.values()].map((tris) => submesh(mesh, new Set(tris)))
}

function submesh(mesh: MeshData, tris: Set<number>): MeshData {
  const remap = new Map<number, number>()
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[t * 3 + k]
      let i = remap.get(v)
      if (i === undefined) {
        i = remap.size
        remap.set(v, i)
        positions.push(...vertex(mesh, v))
        normals.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2])
      }
      indices.push(i)
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) }
}

/** Nearest-point lookup over a point cloud (uniform hash grid). */
class PointIndex {
  private cell: number
  private map = new Map<string, number[]>()
  private pts: Vec3[]
  constructor(pts: Vec3[], cell: number) {
    this.pts = pts
    this.cell = cell
    pts.forEach((p, i) => {
      const k = this.key(p)
      ;(this.map.get(k) ?? this.map.set(k, []).get(k)!).push(i)
    })
  }
  private key(p: Vec3) {
    return p.map((x) => Math.floor(x / this.cell)).join(',')
  }
  /** Distance to the nearest point (searches outward until found). */
  nearest(p: Vec3): { i: number; d: number } {
    const c = p.map((x) => Math.floor(x / this.cell))
    let best = { i: -1, d: Infinity }
    for (let r = 0; r < 64; r++) {
      for (let dz = -r; dz <= r; dz++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue
            for (const i of this.map.get(`${c[0] + dx},${c[1] + dy},${c[2] + dz}`) ?? []) {
              const d = dist(p, this.pts[i])
              if (d < best.d) best = { i, d }
            }
          }
      if (best.i >= 0 && best.d < r * this.cell) break
    }
    return best
  }
}

const pointsOf = (m: MeshData) => Array.from({ length: m.positions.length / 3 }, (_, i) => vertex(m, i))

/** Open boundary loops of a mesh (tube ends): centre, mean radius and the loop's vertices. */
function boundaryLoops(mesh: MeshData): { centre: Vec3; radius: number; points: Vec3[] }[] {
  const n = mesh.positions.length / 3
  const key = (i: number) => vertex(mesh, i).map((x) => x.toFixed(6)).join(',')
  const canon = new Map<string, number>()
  const c = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const k = key(i)
    if (!canon.has(k)) canon.set(k, i)
    c[i] = canon.get(k)!
  }
  const edges = new Map<string, number>()
  const I = mesh.indices
  for (let t = 0; t < I.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = c[I[t + e]]
      const b = c[I[t + ((e + 1) % 3)]]
      const k = a < b ? `${a}_${b}` : `${b}_${a}`
      edges.set(k, (edges.get(k) ?? 0) + 1)
    }
  const adj = new Map<number, number[]>()
  for (const [k, count] of edges) {
    if (count !== 1) continue
    const [a, b] = k.split('_').map(Number)
    ;(adj.get(a) ?? adj.set(a, []).get(a)!).push(b)
    ;(adj.get(b) ?? adj.set(b, []).get(b)!).push(a)
  }
  const seen = new Set<number>()
  const loops: { centre: Vec3; radius: number; points: Vec3[] }[] = []
  for (const s of adj.keys()) {
    if (seen.has(s)) continue
    const comp: number[] = []
    const stack = [s]
    seen.add(s)
    while (stack.length) {
      const x = stack.pop()!
      comp.push(x)
      for (const y of adj.get(x)!) if (!seen.has(y)) {
        seen.add(y)
        stack.push(y)
      }
    }
    if (comp.length < 5) continue
    const points = comp.map((v) => vertex(mesh, v))
    const centre = mul(points.reduce(add, [0, 0, 0] as Vec3), 1 / points.length)
    loops.push({ centre, radius: points.reduce((s, p) => s + dist(p, centre), 0) / points.length, points })
  }
  return loops
}

// ---------------------------------------------------------------------------
// 1. Bronchial tree (atlas): walls per airway, cartilage plates assigned to the nearest airway
// ---------------------------------------------------------------------------

interface Airway {
  spec: AirwaySpec
  wall: MeshData
  cartilage: MeshData | null
  points: PointIndex
}

const airways = new Map<string, Airway>()
const airwayKey = (side: Side, id: string) => `${side}:${id}`
for (const spec of AIRWAYS) {
  const wall = mergeMeshData(spec.meshes.map(lungMesh))
  airways.set(airwayKey(spec.side, spec.id), { spec, wall, cartilage: null, points: new PointIndex(pointsOf(wall), 0.004) })
}
for (const side of ['right', 'left'] as Side[]) {
  const mine = [...airways.values()].filter((a) => a.spec.side === side)
  const plates = new Map<Airway, MeshData[]>()
  for (const plate of components(mergeMeshData(CARTILAGE[side].map(lungMesh)))) {
    const c = centroid(plate.positions)
    let best: Airway = mine[0]
    let bestD = Infinity
    for (const a of mine) {
      const d = a.points.nearest(c).d
      if (d < bestD) {
        bestD = d
        best = a
      }
    }
    ;(plates.get(best) ?? plates.set(best, []).get(best)!).push(plate)
  }
  for (const [a, list] of plates) a.cartilage = mergeMeshData(list)
}
log('bronchial tree:', airways.size, 'airways')

/** Where each main bronchus ends: between the openings of its two lobar bronchi. */
function proximalLoop(a: Airway, towards: Vec3) {
  return boundaryLoops(a.wall).reduce((best, l) => (dist(l.centre, towards) < dist(best.centre, towards) ? l : best))
}
const CARINA_GUESS: Vec3 = [-0.006, 0.549, -0.013]
const mainEnd = (side: Side) => {
  const [a, b] = AIRWAYS.filter((s) => s.side === side && s.parent === 'main_bronchus').map((s) => proximalLoop(airways.get(airwayKey(side, s.id))!, CARINA_GUESS))
  return { centre: mul(add(a.centre, b.centre), 0.5), radius: Math.max(a.radius, b.radius) + dist(a.centre, b.centre) * 0.35 }
}
const R_END = mainEnd('right')
const L_END = mainEnd('left')
log('main bronchus ends', round(R_END.centre, 4), R_END.radius.toFixed(4), round(L_END.centre, 4), L_END.radius.toFixed(4))

// ---------------------------------------------------------------------------
// 2. Trachea and main bronchi (modelled): signed-distance tubes on a fine grid
// ---------------------------------------------------------------------------

interface TubeSpec {
  id: 'trachea' | 'right_main' | 'left_main'
  /** Centre line, top to bottom. */
  path: Vec3[]
  /** Outer radius at the start and end. */
  r0: number
  r1: number
  /** Wall thickness. */
  wall: number
  rings: number
  /** The trachea's back is flat (D-shaped cross-section). */
  flatBack: boolean
}

const CARINA = CARINA_GUESS
const TRACHEA_TOP: Vec3 = [-0.0035, 0.668, 0.007]
/** Catmull-Rom through control points, `n` samples. */
function curve(ctrl: Vec3[], n: number): Vec3[] {
  const out: Vec3[] = []
  const m = ctrl.length - 1
  for (let s = 0; s < n; s++) {
    const u = (s / (n - 1)) * m
    const k = Math.min(m - 1, Math.floor(u))
    const t = u - k
    const p0 = ctrl[Math.max(0, k - 1)]
    const p1 = ctrl[k]
    const p2 = ctrl[k + 1]
    const p3 = ctrl[Math.min(m, k + 2)]
    out.push(
      [0, 1, 2].map((c) => {
        const t2 = t * t
        const t3 = t2 * t
        return 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)
      }) as Vec3,
    )
  }
  return out
}

// The trachea leans back as it descends, following the spine; the right main bronchus
// is short, wide and steep, the left one long and narrow, curving under the aortic arch.
const TUBES: TubeSpec[] = [
  {
    id: 'trachea',
    path: curve([TRACHEA_TOP, [-0.0045, 0.62, 0.002], [-0.0055, 0.58, -0.006], CARINA], 60),
    r0: 0.0102,
    r1: 0.0108,
    wall: 0.0022,
    rings: 18,
    flatBack: true,
  },
  {
    id: 'right_main',
    path: curve([CARINA, mul(add(add(CARINA, R_END.centre), [-0.002, 0.004, 0]), 0.5), R_END.centre], 30),
    r0: 0.0086,
    r1: Math.max(0.0084, R_END.radius),
    wall: 0.0016,
    rings: 6,
    flatBack: false,
  },
  {
    id: 'left_main',
    path: curve([CARINA, add(mul(add(CARINA, L_END.centre), 0.5), [0, 0.006, 0.001]), L_END.centre], 40),
    r0: 0.0074,
    r1: Math.max(0.0074, L_END.radius),
    wall: 0.0015,
    rings: 11,
    flatBack: false,
  },
]

/** Nearest point on a polyline: distance, arc position (0..1), tangent and the point. */
function onPath(path: Vec3[], p: Vec3) {
  let best = { d: Infinity, s: 0, tangent: [0, 1, 0] as Vec3, at: path[0] }
  let acc = 0
  const lengths = path.slice(1).map((q, i) => dist(q, path[i]))
  const total = lengths.reduce((a, b) => a + b, 0)
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const ab = sub(path[i + 1], a)
    const L = lengths[i]
    const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / (L * L)))
    const at = add(a, mul(ab, t))
    const d = dist(p, at)
    if (d < best.d) best = { d, s: (acc + t * L) / total, tangent: unit(ab), at }
    acc += L
  }
  return { ...best, total }
}

/** Builds the trachea and main bronchi as labelled voxels, then meshes each structure. */
function buildTubes() {
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const t of TUBES)
    for (const p of t.path)
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], p[a] - 0.014)
        hi[a] = Math.max(hi[a], p[a] + 0.014)
      }
  const grid = Grid.around(lo, hi, 0.0004, 2)
  log('airway tubes grid', grid.nx, grid.ny, grid.nz)
  // Label = tube * 1000 + layer: 1 mucosa, 2 trachealis, 3 annular ligaments, 100 + k = ring k.
  const labels = new Int16Array(grid.size).fill(-1)
  const SMOOTH = 0.0025
  // Open ends: the trachea stops at its top, each main bronchus where its lobar bronchi begin.
  const topDown = unit(sub(TUBES[0].path[1], TUBES[0].path[0]))
  const ends = TUBES.map((t) => ({ at: t.path[t.path.length - 1], dir: unit(sub(t.path[t.path.length - 1], t.path[t.path.length - 2])) }))
  const boxes = TUBES.map((t) => boundsOf(new Float32Array(t.path.flat())))
  const near = (p: Vec3, ti: number) => {
    const b = boxes[ti]
    const m = Math.max(TUBES[ti].r0, TUBES[ti].r1) + 0.004
    return p.every((x, a) => x > b.min[a] - m && x < b.max[a] + m)
  }
  for (let v = 0; v < grid.size; v++) {
    const p = grid.centre(v)
    if (dot(sub(p, TRACHEA_TOP), topDown) < 0) continue
    if (TUBES.some((_, ti) => ti > 0 && dot(sub(p, ends[ti].at), ends[ti].dir) > 0.0008)) continue
    // Smooth union of the three tubes: the airway's outer surface is where D = 0.
    let D = Infinity
    let owner = -1
    let ownerD = Infinity
    const hits = TUBES.map((tube, ti) => {
      if (!near(p, ti)) return null
      const q = onPath(tube.path, p)
      const r = tube.r0 + (tube.r1 - tube.r0) * q.s
      // Local frame: forward = tangent, back = posterior (−z) made perpendicular.
      const back = unit(sub([0, 0, -1], mul(q.tangent, dot([0, 0, -1], q.tangent))))
      const radial = sub(p, q.at)
      const rl = len(radial) || 1e-9
      const cosBack = dot(radial, back) / rl
      const radius = tube.flatBack ? r * (1 - 0.2 * Math.max(0, cosBack) ** 3) : r
      const d = q.d - radius
      if (d < ownerD) {
        ownerD = d
        owner = ti
      }
      return { d, q, cosBack, r, tube }
    })
    if (owner < 0) continue
    for (const h of hits) if (h) D = D === Infinity ? h.d : smin(D, h.d, SMOOTH)
    const h = hits[owner]!
    const depth = -D
    if (depth <= 0 || depth > h.tube.wall) continue
    const sector = h.cosBack > Math.cos((50 * Math.PI) / 180) // back gap of the C-shaped rings
    const ringPos = h.q.s * h.tube.rings
    const ring = Math.min(h.tube.rings - 1, Math.floor(ringPos))
    const inRing = ringPos - ring < 0.62
    const mucosa = depth > h.tube.wall - 0.0006
    let layer: number
    if (mucosa) layer = 1
    else if (sector) layer = depth > 0.0003 ? 2 : -1
    else if (inRing) layer = 100 + ring
    else layer = depth > 0.00045 ? 3 : -1
    if (layer < 0) continue
    labels[v] = owner * 1000 + layer
  }
  const counts = new Map<number, number>()
  for (const l of labels) if (l >= 0) counts.set(l, (counts.get(l) ?? 0) + 1)
  const mesh = (l: number) => regionMesh(grid, labels, (x) => x === l, { blur: 0.8, iso: 0.5, smooth: 6 })
  const out = new Map<string, MeshData>()
  const rings: Record<string, MeshData[]> = {}
  TUBES.forEach((tube, ti) => {
    out.set(`${tube.id}:mucosa`, mesh(ti * 1000 + 1))
    out.set(`${tube.id}:trachealis`, mesh(ti * 1000 + 2))
    out.set(`${tube.id}:ligaments`, mesh(ti * 1000 + 3))
    // Rings swallowed by the junction (the bronchi's first rings inside the trachea's) drop out.
    const sizes = Array.from({ length: tube.rings }, (_, k) => counts.get(ti * 1000 + 100 + k) ?? 0)
    log(tube.id, 'ring voxels', sizes.join(' '))
    rings[tube.id] = sizes.flatMap((n, k) => (n > 400 ? [mesh(ti * 1000 + 100 + k)] : []))
  })
  log('airway tubes meshed')
  return { meshes: out, rings }
}

/** Polynomial smooth minimum (blends two distance fields over `k`). */
function smin(a: number, b: number, k: number) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k))
  return b * (1 - h) + a * h - k * h * (1 - h)
}

const tubes = buildTubes()

// ---------------------------------------------------------------------------
// 3. Lungs: solid segments, lobes and lobules
// ---------------------------------------------------------------------------

interface LungResult {
  lobes: Map<LobeId, { mesh: MeshData; segments: { spec: SegmentSpec; mesh: MeshData; lobules: MeshData[] }[] }>
  /** Lowest lung voxel per (x, z) column, for fitting the diaphragm. */
  base: { grid: Grid; minY: Float32Array }
}

function buildLung(side: Side): LungResult {
  const suffix = side === 'right' ? 'R' : 'L'
  const lungNode = docs.lung.getRoot().listNodes().find((n) => n.getName() === `VH_M_lungs_${suffix}`)!
  const patches: MeshData[] = []
  lungNode.traverse((n) => {
    if (n.getMesh()) patches.push(worldMeshData(n))
  })
  const surface = mergeMeshData(patches)
  const b = boundsOf(surface.positions)
  const grid = Grid.around(b.min, b.max, H, 4)
  const wall = new Uint8Array(grid.size)
  rasterize(grid, surface, wall)
  const solid = fillInside(grid, wall)

  // Seeds: each segment's pleural patch and its bronchus.
  const segs = SEGMENTS.filter((s) => s.lobe.startsWith(side))
  const labels = new Int16Array(grid.size).fill(-1)
  const patchPts = segs.map((s) => new PointIndex(pointsOf(lungMesh(s.patch)), 0.006))
  segs.forEach((s, i) => rasterize(grid, lungMesh(s.patch), labels, i))
  const done = new Set<string>()
  for (const s of segs) {
    if (done.has(s.bronchus)) continue
    done.add(s.bronchus)
    const sharing = segs.map((x, i) => (x.bronchus === s.bronchus ? i : -1)).filter((i) => i >= 0)
    const bronchus = lungMesh(s.bronchus)
    if (sharing.length === 1) {
      rasterize(grid, bronchus, labels, sharing[0])
      continue
    }
    // A bronchus serving two segments: each branch goes to the segment it is nearest to.
    const owned = splitByNearest(bronchus, sharing.map((i) => patchPts[i]))
    owned.forEach((m, k) => rasterize(grid, m, labels, sharing[k]))
  }
  growLabels(grid, solid, labels)
  log(side, 'lung segmented')

  // Lobules: Poisson seeds inside each segment, then the same geodesic split.
  const lobuleLabels = new Int16Array(grid.size).fill(-1)
  const lobulesOf: number[][] = []
  let next = 0
  segs.forEach((_, i) => {
    const voxels: number[] = []
    for (let v = 0; v < grid.size; v++) if (labels[v] === i) voxels.push(v)
    const seeds = poissonVoxels(grid, voxels, LOBULE_SPACING, rng(1000 + i + (side === 'left' ? 50 : 0)))
    // Order lobules top to bottom, so their numbers read naturally.
    seeds.sort((a, b) => grid.centre(b)[1] - grid.centre(a)[1])
    const domain = new Uint8Array(grid.size)
    for (const v of voxels) domain[v] = 1
    const local = new Int16Array(grid.size).fill(-1)
    seeds.forEach((v, k) => (local[v] = k))
    growLabels(grid, domain, local)
    const ids: number[] = []
    seeds.forEach(() => ids.push(next++))
    for (const v of voxels) if (local[v] >= 0) lobuleLabels[v] = ids[local[v]]
    lobulesOf.push(ids)
  })
  log(side, 'lobules', next)

  const lobes = new Map<LobeId, LungResult['lobes'] extends Map<LobeId, infer V> ? V : never>()
  for (const lobe of LOBES.filter((l) => l.side === side)) {
    const mine = segs.map((s, i) => (s.lobe === lobe.id ? i : -1)).filter((i) => i >= 0)
    const mesh = regionMesh(grid, labels, (l) => mine.includes(l), { blur: 1.3, iso: 0.5, smooth: 10 })
    const segments = mine.map((i) => ({
      spec: segs[i],
      mesh: regionMesh(grid, labels, (l) => l === i, { blur: 1.1, iso: 0.52, smooth: 8 }),
      lobules: lobulesOf[i].map((id) => regionMesh(grid, lobuleLabels, (l) => l === id, { blur: 0.9, iso: 0.56, smooth: 6 })),
    }))
    lobes.set(lobe.id, { mesh, segments })
    log(side, lobe.id, 'meshed', segments.map((s) => `${s.spec.id}:${s.lobules.length}`).join(' '))
  }

  // Lung base per (x, z) column.
  const minY = new Float32Array(grid.nx * grid.nz).fill(Infinity)
  for (let v = 0; v < grid.size; v++) {
    if (!solid[v]) continue
    const [i, j, k] = grid.ijk(v)
    const y = grid.min[1] + (j + 0.5) * H
    const c = i + grid.nx * k
    if (y < minY[c]) minY[c] = y
  }
  return { lobes, base: { grid, minY } }
}

/** Splits a mesh's triangles between owners by which owner's points each triangle is nearest to. */
function splitByNearest(mesh: MeshData, owners: PointIndex[]): MeshData[] {
  const sets = owners.map(() => new Set<number>())
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const c = mul(add(add(vertex(mesh, mesh.indices[t * 3]), vertex(mesh, mesh.indices[t * 3 + 1])), vertex(mesh, mesh.indices[t * 3 + 2])), 1 / 3)
    let owner = 0
    let best = Infinity
    owners.forEach((o, i) => {
      const d = o.nearest(c).d
      if (d < best) {
        best = d
        owner = i
      }
    })
    sets[owner].add(t)
  }
  return sets.map((s) => submesh(mesh, s))
}

const lungs = { right: buildLung('right'), left: buildLung('left') }

// ---------------------------------------------------------------------------
// 4. Diaphragm: a muscular sheet fitted under the lung bases
// ---------------------------------------------------------------------------

/** Centre of a vessel's cross-section at height y (mean of the vertices near it). */
function vesselAt(name: string, y: number): Vec3 {
  const m = atlas(docs.vessels, name)
  const near = pointsOf(m).filter((p) => Math.abs(p[1] - y) < 0.003)
  if (!near.length) throw new Error(`No ${name} vertices near y=${y}`)
  return mul(near.reduce(add, [0, 0, 0] as Vec3), 1 / near.length)
}

function buildDiaphragm() {
  const h = 0.001
  // Height map of the lung bases over a common (x, z) grid.
  const all = [lungs.right.base, lungs.left.base]
  const x0 = Math.min(...all.map((b) => b.grid.min[0])) - 0.012
  const x1 = Math.max(...all.map((b) => b.grid.min[0] + b.grid.nx * H)) + 0.012
  const z0 = Math.min(...all.map((b) => b.grid.min[2])) - 0.012
  const z1 = Math.max(...all.map((b) => b.grid.min[2] + b.grid.nz * H)) + 0.006
  const nx = Math.ceil((x1 - x0) / h)
  const nz = Math.ceil((z1 - z0) / h)
  const top = new Float32Array(nx * nz).fill(NaN)
  for (const b of all)
    for (let k = 0; k < b.grid.nz; k++)
      for (let i = 0; i < b.grid.nx; i++) {
        const y = b.minY[i + b.grid.nx * k]
        if (!Number.isFinite(y)) continue
        const x = b.grid.min[0] + (i + 0.5) * H
        const z = b.grid.min[2] + (k + 0.5) * H
        const c = Math.floor((x - x0) / h) + nx * Math.floor((z - z0) / h)
        top[c] = Number.isNaN(top[c]) ? y : Math.min(top[c], y)
      }
  // Only the lower surface of each lung faces the diaphragm: drop columns whose lowest
  // point is high up (the apex region seen from below, the hilum).
  const footprint = new Uint8Array(nx * nz)
  for (let c = 0; c < top.length; c++) if (top[c] < 0.455) footprint[c] = 1
  // Close the gap between the two lungs (the heart sits on the central tendon there).
  const filled = closeFootprint(footprint, nx, nz, 30)
  const hgt = new Float32Array(nx * nz)
  for (let c = 0; c < top.length; c++) hgt[c] = footprint[c] ? top[c] - 0.0015 : NaN
  relax(hgt, filled, nx, nz, 600)
  // A muscle sheet has no steps: smooth hard, but never into the lungs.
  smooth2d(hgt, filled, nx, nz, 80)
  for (let c = 0; c < top.length; c++) if (footprint[c]) hgt[c] = Math.min(hgt[c], top[c] - 0.0015)
  smooth2d(hgt, filled, nx, nz, 4)
  // At its rim the sheet curls down along the inside of the chest wall (the zone of apposition).
  const rimCells = rimDistance(filled, nx, nz)
  for (let c = 0; c < hgt.length; c++) {
    const r = rimCells[c] * h
    if (filled[c] && r < 0.016) hgt[c] -= 0.02 * (1 - r / 0.016) ** 2
  }
  // Vertical thickness that keeps the sheet 3.5 mm thick where it slopes.
  const thick = new Float32Array(nx * nz)
  for (let k = 1; k < nz - 1; k++)
    for (let i = 1; i < nx - 1; i++) {
      const c = i + nx * k
      if (!filled[c]) continue
      const gx = filled[c + 1] && filled[c - 1] ? (hgt[c + 1] - hgt[c - 1]) / (2 * h) : 0
      const gz = filled[c + nx] && filled[c - nx] ? (hgt[c + nx] - hgt[c - nx]) / (2 * h) : 0
      thick[c] = Math.min(0.012, 0.0035 * Math.sqrt(1 + gx * gx + gz * gz))
    }

  // Openings and crura from the vessels that pass through it.
  const ivc = vesselAt('inferior_vena_cava_a', 0.432)
  const aorta = vesselAt('descending_aorta_b', 0.372)
  const oesophagus: Vec3 = [aorta[0] - 0.004, 0.41, aorta[2] + 0.018]
  log('diaphragm openings: caval', round(ivc, 4), 'aortic', round(aorta, 4))

  // Signed distance-ish volume on a 3D grid: the sheet (3.5 mm thick) plus the costal
  // skirt along its rim and the two crura down the front of the spine.
  const y0 = aorta[1] - 0.045
  const y1 = 0.475
  const grid = Grid.around([x0, y0, z0], [x1, y1, z1], h, 2)
  const labels = new Int16Array(grid.size).fill(-1)
  const centre: Vec3 = [(ivc[0] + oesophagus[0]) / 2, 0, ivc[2] - 0.004]
  for (let v = 0; v < grid.size; v++) {
    const [x, y, z] = grid.centre(v)
    const ci = Math.floor((x - x0) / h)
    const ck = Math.floor((z - z0) / h)
    const inMap = ci >= 0 && ck >= 0 && ci < nx && ck < nz
    const c = ci + nx * ck
    let piece = -1
    if (inMap && filled[c]) {
      const surf = hgt[c]
      if (y <= surf && y >= surf - thick[c]) {
        // Openings.
        const hole = (p: Vec3, rr: number) => Math.hypot(x - p[0], z - p[2]) < rr
        if (hole(ivc, 0.0115) || hole(oesophagus, 0.008) || hole(aorta, 0.0115)) continue
        // Central tendon: a trefoil (one leaflet in front, one on each side).
        const leaf = (cx: number, cz: number, rx: number, rz: number) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1
        const tendon =
          leaf(centre[0] + 0.003, centre[2] + 0.024, 0.04, 0.026) ||
          leaf(centre[0] - 0.045, centre[2] - 0.004, 0.03, 0.034) ||
          leaf(centre[0] + 0.05, centre[2] - 0.004, 0.028, 0.032)
        piece = tendon ? 0 : x < centre[0] ? 1 : 2
      }
    }
    // Crura: two tapering pillars on either side of the aortic opening, down to the lumbar spine.
    if (piece < 0 && y < 0.44) {
      for (const [s, p] of [[3, -1], [4, 1]] as const) {
        const t = Math.min(1, Math.max(0, (0.44 - y) / (0.44 - y0)))
        const cx = aorta[0] + p * (0.011 - 0.006 * t) - (s === 3 ? 0.002 : 0)
        const cz = aorta[2] - 0.004 + 0.012 * (1 - t)
        const rr = 0.0055 * (1 - 0.55 * t)
        // The right crus is longer than the left.
        if (s === 4 && y < y0 + 0.012) continue
        if (Math.hypot((x - cx) * 1.4, z - cz) < rr && Math.hypot(x - aorta[0], z - aorta[2]) > 0.0095) piece = s
      }
    }
    if (piece >= 0) labels[v] = piece
  }
  const mesh = (l: number) => regionMesh(grid, labels, (x) => x === l, { blur: 1, iso: 0.5, smooth: 8 })
  log('diaphragm meshed')
  return { central_tendon: mesh(0), right_dome: mesh(1), left_dome: mesh(2), right_crus: mesh(3), left_crus: mesh(4) }
}

/** Morphological closing of a 2D mask (dilate then erode by r cells). */
function closeFootprint(mask: Uint8Array, nx: number, nz: number, r: number): Uint8Array {
  const d = distanceTo(mask, nx, nz, 1)
  const grown = Uint8Array.from(d, (x) => (x <= r ? 1 : 0))
  const back = distanceTo(grown, nx, nz, 0)
  return Uint8Array.from(back, (x) => (x > r ? 1 : 0))
}

/** Chamfer distance (in cells) of every cell to the nearest cell whose mask equals `target`. */
function distanceTo(mask: Uint8Array, nx: number, nz: number, target: 0 | 1): Float32Array {
  const d = new Float32Array(nx * nz)
  for (let c = 0; c < d.length; c++) d[c] = mask[c] === target ? 0 : 1e9
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const c = i + nx * k
      if (i > 0) d[c] = Math.min(d[c], d[c - 1] + 1)
      if (k > 0) d[c] = Math.min(d[c], d[c - nx] + 1)
      if (i > 0 && k > 0) d[c] = Math.min(d[c], d[c - nx - 1] + 1.414)
      if (i < nx - 1 && k > 0) d[c] = Math.min(d[c], d[c - nx + 1] + 1.414)
    }
  for (let k = nz - 1; k >= 0; k--)
    for (let i = nx - 1; i >= 0; i--) {
      const c = i + nx * k
      if (i < nx - 1) d[c] = Math.min(d[c], d[c + 1] + 1)
      if (k < nz - 1) d[c] = Math.min(d[c], d[c + nx] + 1)
      if (i < nx - 1 && k < nz - 1) d[c] = Math.min(d[c], d[c + nx + 1] + 1.414)
      if (i > 0 && k < nz - 1) d[c] = Math.min(d[c], d[c + nx - 1] + 1.414)
    }
  return d
}

/** Distance (cells) from each cell inside a mask to its edge. */
function rimDistance(mask: Uint8Array, nx: number, nz: number): Float32Array {
  return distanceTo(mask, nx, nz, 0)
}

/** Fills NaN cells inside `mask` by relaxation (harmonic interpolation from known cells). */
function relax(f: Float32Array, mask: Uint8Array, nx: number, nz: number, iterations: number) {
  const known = f.map((x) => (Number.isNaN(x) ? 0 : 1))
  let mean = 0
  let n = 0
  for (const x of f)
    if (!Number.isNaN(x)) {
      mean += x
      n++
    }
  mean /= n
  for (let c = 0; c < f.length; c++) if (Number.isNaN(f[c])) f[c] = mean
  for (let it = 0; it < iterations; it++)
    for (let k = 1; k < nz - 1; k++)
      for (let i = 1; i < nx - 1; i++) {
        const c = i + nx * k
        if (known[c] || !mask[c]) continue
        const avg = maskedMean(f, mask, nx, c)
        if (avg !== null) f[c] = avg
      }
}

/** Mean of a cell's 4 neighbours that are inside the mask (cells outside hold no height). */
function maskedMean(f: Float32Array, mask: Uint8Array, nx: number, c: number): number | null {
  let s = 0
  let n = 0
  for (const d of [-1, 1, -nx, nx])
    if (mask[c + d]) {
      s += f[c + d]
      n++
    }
  return n ? s / n : null
}

function smooth2d(f: Float32Array, mask: Uint8Array, nx: number, nz: number, iterations: number) {
  for (let it = 0; it < iterations; it++) {
    const g = f.slice()
    for (let k = 1; k < nz - 1; k++)
      for (let i = 1; i < nx - 1; i++) {
        const c = i + nx * k
        if (!mask[c]) continue
        const avg = maskedMean(f, mask, nx, c)
        if (avg !== null) g[c] = (f[c] + avg) / 2
      }
    f.set(g)
  }
}

const diaphragm = buildDiaphragm()

// ---------------------------------------------------------------------------
// 5. Airway centre lines (for the air flow)
// ---------------------------------------------------------------------------

interface AirNode {
  p: Vec3
  r: number
  children: AirNode[]
}

/**
 * Centre line tree of a tube-shaped mesh: walk the surface from its root opening
 * (geodesic distance), cut it into rings every `step`, and link each ring's centre
 * to the ring it grew from. Branches appear where a ring splits in two.
 */
function skeleton(mesh: MeshData, rootNear: Vec3, step = 0.0016): AirNode | null {
  const n = mesh.positions.length / 3
  const key = (i: number) => vertex(mesh, i).map((x) => x.toFixed(6)).join(',')
  const canon = new Map<string, number>()
  const c = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const k = key(i)
    if (!canon.has(k)) canon.set(k, i)
    c[i] = canon.get(k)!
  }
  const adj = new Map<number, Set<number>>()
  const I = mesh.indices
  for (let t = 0; t < I.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = c[I[t + e]]
      const b = c[I[t + ((e + 1) % 3)]]
      if (a === b) continue
      ;(adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
      ;(adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a)
    }
  const verts = [...adj.keys()]
  // Root: the open loop nearest the parent.
  const loops = boundaryLoops(mesh)
  if (!loops.length) return null
  const rootLoop = loops.reduce((best, l) => (dist(l.centre, rootNear) < dist(best.centre, rootNear) ? l : best))
  const rootSet = new Set(rootLoop.points.map((p) => p.map((x) => x.toFixed(6)).join(',')))
  const D = new Map<number, number>()
  const queue: [number, number][] = []
  for (const v of verts)
    if (rootSet.has(key(v))) {
      D.set(v, 0)
      queue.push([0, v])
    }
  // Dijkstra with a simple binary heap.
  const heap = queue
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
  heap.forEach((_, i) => up(i))
  while (heap.length) {
    const [d, v] = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      down(0)
    }
    if (d > (D.get(v) ?? Infinity)) continue
    for (const w of adj.get(v)!) {
      const nd = d + dist(vertex(mesh, v), vertex(mesh, w))
      if (nd < (D.get(w) ?? Infinity)) {
        D.set(w, nd)
        heap.push([nd, w])
        up(heap.length - 1)
      }
    }
  }
  // Rings: connected vertex sets per distance bin.
  const bin = new Map<number, number>()
  for (const v of verts) if (D.has(v)) bin.set(v, Math.floor(D.get(v)! / step))
  const ringOf = new Map<number, number>()
  const rings: { b: number; verts: number[] }[] = []
  for (const v of verts) {
    if (!bin.has(v) || ringOf.has(v)) continue
    const b = bin.get(v)!
    const id = rings.length
    const members: number[] = []
    const stack = [v]
    ringOf.set(v, id)
    while (stack.length) {
      const x = stack.pop()!
      members.push(x)
      for (const w of adj.get(x)!) if (bin.get(w) === b && !ringOf.has(w)) {
        ringOf.set(w, id)
        stack.push(w)
      }
    }
    rings.push({ b, verts: members })
  }
  const nodes = rings.map((ring) => {
    const pts = ring.verts.map((v) => vertex(mesh, v))
    const p = mul(pts.reduce(add, [0, 0, 0] as Vec3), 1 / pts.length)
    return { node: { p, r: pts.reduce((s, q) => s + dist(q, p), 0) / pts.length, children: [] } as AirNode, ring, parent: -1, size: pts.length }
  })
  // Parent: the most connected ring one bin closer to the root.
  nodes.forEach((nd, id) => {
    const votes = new Map<number, number>()
    for (const v of nd.ring.verts)
      for (const w of adj.get(v)!) {
        const r = ringOf.get(w)
        if (r !== undefined && rings[r].b === nd.ring.b - 1) votes.set(r, (votes.get(r) ?? 0) + 1)
      }
    let best = -1
    let bestVotes = 0
    for (const [r, cnt] of votes)
      if (cnt > bestVotes) {
        bestVotes = cnt
        best = r
      }
    nd.parent = best
    void id
  })
  // Tiny rings (noise at bifurcations) are skipped by linking their children to their parent.
  const keep = (id: number) => nodes[id].size >= 5
  const resolve = (id: number): number => (id < 0 || keep(id) ? id : resolve(nodes[id].parent))
  let root: AirNode | null = null
  nodes.forEach((nd, id) => {
    if (!keep(id)) return
    const p = resolve(nd.parent)
    if (p >= 0) nodes[p].node.children.push(nd.node)
    else if (nd.ring.b === 0 && (!root || nd.size > 0)) root ??= nd.node
  })
  return root
}

interface AirSegment {
  id: string
  points: Vec3[]
  radius: number[]
  next: string[]
}

/** Flattens a centre-line tree into branch segments (one per run between forks). */
function flatten(root: AirNode, prefix: string, out: AirSegment[], start?: Vec3): string {
  let count = 0
  const walk = (node: AirNode, first: Vec3 | undefined): string => {
    const id = `${prefix}${count++}`
    const points: Vec3[] = first ? [first] : []
    const radius: number[] = first ? [node.r] : []
    let cur = node
    for (;;) {
      points.push(cur.p)
      radius.push(cur.r)
      const kids = cur.children.filter((k) => depthOf(k) >= 3)
      if (kids.length !== 1) {
        const seg: AirSegment = { id, points: thin(points), radius: [], next: [] }
        seg.radius = resample(radius, seg.points.length)
        out.push(seg)
        seg.next = kids.map((k) => walk(k, cur.p))
        return id
      }
      cur = kids[0]
    }
  }
  return walk(root, start)
}

const depthMemo = new Map<AirNode, number>()
function depthOf(n: AirNode): number {
  const m = depthMemo.get(n)
  if (m !== undefined) return m
  const d = 1 + Math.max(0, ...n.children.map(depthOf))
  depthMemo.set(n, d)
  return d
}

/** Keeps every few points of a centre line (it is sampled every ~1.6 mm). */
function thin(points: Vec3[]): Vec3[] {
  if (points.length <= 4) return points
  const out = points.filter((_, i) => i % 3 === 0)
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1])
  return out
}

function resample(values: number[], n: number): number[] {
  return Array.from({ length: n }, (_, i) => values[Math.round((i / Math.max(1, n - 1)) * (values.length - 1))])
}

function buildAirPaths() {
  const segments: AirSegment[] = []
  const lumen = (r: number) => +(r * 0.72).toFixed(5)
  // Trachea and main bronchi from their modelled centre lines.
  const tube = (t: TubeSpec, next: string[]): AirSegment => {
    const points = thin(t.path)
    return { id: t.id, points, radius: points.map((_, i) => lumen(t.r0 + ((t.r1 - t.r0) * i) / (points.length - 1))), next }
  }
  // Start a little above the trachea so air visibly comes in from the larynx.
  const trachea = tube(TUBES[0], ['right_main', 'left_main'])
  trachea.points.unshift(add(TRACHEA_TOP, [0.001, 0.02, 0.006]))
  trachea.radius.unshift(trachea.radius[0])
  segments.push(trachea)
  const roots = new Map<string, string>()
  for (const side of ['right', 'left'] as Side[]) {
    const main = tube(TUBES[side === 'right' ? 1 : 2], [])
    segments.push(main)
    // Each airway's tree hangs off the airway it branches from: link its root to the
    // nearest point of the parent's centre line (splitting the parent there).
    const specs = AIRWAYS.filter((s) => s.side === side)
    const built = new Map<string, AirSegment[]>()
    built.set('main_bronchus', [main])
    for (const spec of specs) {
      const parentSegs = built.get(spec.parent)
      if (!parentSegs) throw new Error(`Airway ${spec.id} before its parent ${spec.parent}`)
      const a = airways.get(airwayKey(side, spec.id))!
      // The child's opening nearest the parent's centre line is its root.
      const loops = boundaryLoops(a.wall).map((loop) => ({ loop, q: nearestOn(parentSegs, loop.centre) }))
      if (!loops.length) continue
      const { loop: rootLoop, q: parentEnd } = loops.reduce((best, l) => (l.q.d < best.q.d ? l : best))
      const sk = skeleton(a.wall, rootLoop.centre)
      if (!sk) continue
      const mine: AirSegment[] = []
      const rootId = flatten(sk, `${side}_${spec.id}_`, mine, parentEnd.point)
      for (const s of mine) s.radius = s.radius.map(lumen)
      splitAt(parentEnd, rootId, segments, parentSegs)
      segments.push(...mine)
      built.set(spec.id, mine)
      roots.set(`${side}:${spec.id}`, rootId)
    }
  }
  return segments.map((s) => ({ ...s, points: s.points.map((p) => round(sub(p, ORIGIN))), radius: s.radius }))
}

/** Nearest point on any of the given segments. */
function nearestOn(segs: AirSegment[], p: Vec3) {
  let best = { seg: segs[0], index: 0, point: segs[0].points[0], d: Infinity }
  for (const seg of segs)
    seg.points.forEach((q, index) => {
      const d = dist(p, q)
      if (d < best.d) best = { seg, index, point: q, d }
    })
  return best
}

/** Makes `childId` branch off `at.seg` at point `at.index`, splitting the segment there if needed. */
function splitAt(at: ReturnType<typeof nearestOn>, childId: string, all: AirSegment[], family: AirSegment[]) {
  const seg = at.seg
  if (at.index >= seg.points.length - 1 || at.index === 0) {
    if (at.index === 0) {
      // Branching at a segment's very start: hang it off whatever leads into it.
      const into = all.find((s) => s.next.includes(seg.id))
      if (into) {
        into.next.push(childId)
        return
      }
    }
    seg.next.push(childId)
    return
  }
  const tailId = `${seg.id}~${at.index}`
  const tail: AirSegment = {
    id: tailId,
    points: seg.points.slice(at.index),
    radius: seg.radius.slice(at.index),
    next: seg.next,
  }
  seg.points = seg.points.slice(0, at.index + 1)
  seg.radius = seg.radius.slice(0, at.index + 1)
  seg.next = [tailId, childId]
  all.push(tail)
  family.push(tail)
}

// ---------------------------------------------------------------------------
// 6. Assemble the parts
// ---------------------------------------------------------------------------

// Centre the model on the two lungs.
const lungBounds = boundsOf(
  mergeMeshData([...lungs.right.lobes.values(), ...lungs.left.lobes.values()].map((l) => l.mesh)).positions,
)
const ORIGIN: Vec3 = [
  (lungBounds.min[0] + lungBounds.max[0]) / 2,
  (lungBounds.min[1] + lungBounds.max[1]) / 2,
  (lungBounds.min[2] + lungBounds.max[2]) / 2,
]

const piece = (id: string, data: MeshData | undefined, maxTriangles: number, pieces?: OutputPiece[], error?: number): OutputPiece => ({ id, data, maxTriangles, pieces, error })
const pad = (k: number) => String(k + 1).padStart(2, '0')

const parts: OutputPart[] = []
const lobuleCounts: Record<string, Record<string, number>> = {}

for (const side of ['right', 'left'] as Side[]) {
  for (const [lobeId, lobe] of lungs[side].lobes) {
    lobuleCounts[lobeId] = {}
    parts.push({
      id: lobeId,
      data: lobe.mesh,
      maxTriangles: 9000,
      pieces: lobe.segments.map((s) => {
        lobuleCounts[lobeId][s.spec.id] = s.lobules.length
        return piece(
          s.spec.id,
          s.mesh,
          2600,
          s.lobules.map((l, k) => piece(`lobule_${pad(k)}`, l, 200, undefined, 0.05)),
        )
      }),
    })
  }
}

// Bronchial trees: the main bronchus (modelled) + every lobar and segmental bronchus (atlas).
for (const side of ['right', 'left'] as Side[]) {
  const t = side === 'right' ? 'right_main' : 'left_main'
  const rings = tubes.rings[t]
  const main = piece('main_bronchus', undefined, 0, [
    piece('cartilage', mergeMeshData(rings), 6000),
    piece('wall', mergeMeshData([tubes.meshes.get(`${t}:mucosa`)!, tubes.meshes.get(`${t}:ligaments`)!, tubes.meshes.get(`${t}:trachealis`)!]), 5000),
  ])
  const branches = AIRWAYS.filter((s) => s.side === side).map((s) => {
    const a = airways.get(airwayKey(side, s.id))!
    const budget = Math.min(2200, Math.max(600, Math.round(a.wall.indices.length / 3 / 5)))
    if (!a.cartilage) return piece(s.id, a.wall, budget, undefined, 0.02)
    const cb = Math.min(1600, Math.max(400, Math.round(a.cartilage.indices.length / 3 / 7)))
    return piece(s.id, undefined, 0, [piece("wall", a.wall, budget, undefined, 0.02), piece("cartilage", a.cartilage, cb, undefined, 0.03)])
  })
  parts.push({ id: `${side}_bronchial_tree`, data: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, maxTriangles: 0, pieces: [main, ...branches] })
}

// Trachea.
parts.push({
  id: 'trachea',
  data: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() },
  maxTriangles: 0,
  pieces: [
    piece('cartilage_rings', undefined, 0, tubes.rings.trachea.map((m, k) => piece(`ring_${pad(k)}`, m, 700))),
    piece('trachealis', tubes.meshes.get("trachea:trachealis")!, 3000),
    piece('annular_ligaments', tubes.meshes.get("trachea:ligaments")!, 5000),
    piece('mucosa', tubes.meshes.get("trachea:mucosa")!, 5000),
  ],
})

// Pulmonary vessels at the hilum.
const vessel = (name: string) => atlas(docs.vessels, name)
parts.push({
  id: 'pulmonary_arteries',
  data: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() },
  maxTriangles: 0,
  pieces: [
    piece('pulmonary_trunk', vessel('pulmonary_trunk'), 3000),
    piece('right_pulmonary_artery', vessel('pulmonary_artery_R'), 3000),
    piece('left_pulmonary_artery', vessel('pulmonary_artery_L'), 4000),
  ],
})
parts.push({
  id: 'pulmonary_veins',
  data: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() },
  maxTriangles: 0,
  pieces: [
    piece('right_superior_vein', vessel('pulmonary_vein_R_sup'), 1800),
    piece('right_inferior_vein', vessel('pulmonary_vein_R_inf'), 2500),
    piece('left_superior_vein', vessel('pulmonary_vein_L_sup'), 1800),
    piece('left_inferior_vein', vessel('pulmonary_vein_L_inf'), 2000),
  ],
})

// Diaphragm.
parts.push({
  id: 'diaphragm',
  data: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() },
  maxTriangles: 0,
  pieces: Object.entries(diaphragm).map(([id, data]) => piece(id, data, id.includes("crus") ? 1400 : 5500)),
})

const air = buildAirPaths()
await mkdir('public/models', { recursive: true })
await mkdir('src/models/lungs', { recursive: true })
await writePartsGlb('public/models/lungs.glb', 'lungs', parts, ORIGIN, undefined, { filter: true })
// How many lobules each segment has and rings the trachea has (the definition lists them).
await writeFile(
  'src/models/lungs/counts.json',
  `${JSON.stringify(
    {
      lobules: lobuleCounts,
      tracheaRings: tubes.rings.trachea.length,
      // Airways with cartilage plates of their own (they split into wall + cartilage).
      cartilage: Object.fromEntries(
        (['right', 'left'] as Side[]).map((side) => [
          side,
          AIRWAYS.filter((s) => s.side === side && airways.get(airwayKey(side, s.id))!.cartilage).map((s) => s.id),
        ]),
      ),
    },
    null,
    2,
  )}\n`,
)
await writeFile('src/models/lungs/airways.json', JSON.stringify({ origin: round(ORIGIN), segments: air }))
log('airways.json:', air.length, 'air segments')
