// Builds public/models/heart.glb from the Human Reference Atlas (HuBMAP)
// Visible Human Male heart + blood vasculature reference organs (CC BY 4.0).
// Both files share one coordinate frame (metres, +y up, +z anterior), so the
// vessels line up with the heart without any transform.
//
// Besides the meshes, the root's extras carry `connections`: for every part, the part it
// attaches to, the opening where they meet, and (for vessels) the centre line blood follows.
// Assembly guidance and the blood-flow pulses in the app are drawn from these.
//
// Usage: npx tsx scripts/build-heart.ts
import { NodeIO, type Document, type Node } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three'
import { centerline, junction } from './lib/connectors'
import { boundsOf, mergeMeshData, worldMeshData, type MeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb, type OutputPart } from './lib/output'
import { placed } from './lib/three-mesh'

const CACHE = 'scripts/.cache'
const SOURCES = {
  heart: {
    url: 'https://cdn.humanatlas.io/digital-objects/ref-organ/heart-male/v1.3/assets/3d-vh-m-heart.glb',
    file: `${CACHE}/heart-male.glb`,
  },
  vessels: {
    url: 'https://cdn.humanatlas.io/digital-objects/ref-organ/blood-vasculature-male/latest/assets/3d-vh-m-blood-vasculature.glb',
    file: `${CACHE}/vasculature-male.glb`,
  },
}

interface PartSpec {
  id: string
  source: 'heart' | 'vessels'
  nodes: string[]
  /** The part it is joined to (assembly and guidance); none for the base part. */
  attach?: string
  /** Measure a centre line from the opening (vessels). */
  vessel?: boolean
  /** Keep only triangles whose centroid has y above this (trims long vessels). */
  minY?: number
  maxTriangles: number
}

// Node names are the atlas's own. Coronary branch names follow the atlas labels.
const PARTS: PartSpec[] = [
  // Chambers
  { id: 'septum', source: 'heart', nodes: ['VH_M_interventricular_septum'], maxTriangles: 7600 },
  {
    id: 'right_ventricle',
    source: 'heart',
    nodes: ['VH_M_heart_right_ventricle'],
    attach: 'septum',
    maxTriangles: 17100,
  },
  {
    id: 'left_ventricle',
    source: 'heart',
    nodes: ['VH_M_heart_left_ventricle'],
    attach: 'septum',
    maxTriangles: 9350,
  },
  {
    id: 'right_atrium',
    source: 'heart',
    nodes: ['VH_M_right_cardiac_atrium'],
    attach: 'right_ventricle',
    maxTriangles: 17100,
  },
  {
    id: 'left_atrium',
    source: 'heart',
    nodes: ['VH_M_left_cardiac_atrium'],
    attach: 'left_ventricle',
    maxTriangles: 15200,
  },
  {
    id: 'papillary_muscles',
    source: 'heart',
    nodes: [
      'VH_M_papillary_muscle_of_heart_anterior',
      'VH_M_papillary_muscle_of_heart_anterolateral',
      'VH_M_papillary_muscle_of_heart_medial',
      'VH_M_papillary_muscle_of_heart_posterior',
      'VH_M_papillary_muscle_of_heart_posteromedial',
    ],
    // The five muscles sit in both ventricles; the merged part touches the right ventricle's wall.
    attach: 'right_ventricle',
    maxTriangles: 2015,
  },
  // Valves
  {
    id: 'tricuspid_valve',
    source: 'heart',
    nodes: ['VH_M_tricuspid_valve'],
    attach: 'right_atrium',
    maxTriangles: 6600,
  },
  {
    id: 'mitral_valve',
    source: 'heart',
    nodes: ['VH_M_mitral_valve'],
    attach: 'left_atrium',
    maxTriangles: 5700,
  },
  {
    id: 'pulmonary_valve',
    source: 'heart',
    nodes: ['VH_M_pulmonary_valve'],
    attach: 'right_ventricle',
    maxTriangles: 5700,
  },
  {
    id: 'aortic_valve',
    source: 'heart',
    nodes: ['VH_M_aortic_valve'],
    attach: 'left_ventricle',
    maxTriangles: 2680,
  },
  // Great vessels
  {
    id: 'superior_vena_cava',
    source: 'vessels',
    nodes: ['VH_M_superior_vena_cava'],
    attach: 'right_atrium',
    vessel: true,
    maxTriangles: 6600,
  },
  {
    id: 'inferior_vena_cava',
    source: 'vessels',
    nodes: ['VH_M_inferior_vena_cava_a'],
    attach: 'right_atrium',
    vessel: true,
    minY: 0.412,
    maxTriangles: 4800,
  },
  {
    id: 'pulmonary_trunk',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_trunk'],
    attach: 'pulmonary_valve',
    vessel: true,
    maxTriangles: 3126,
  },
  {
    id: 'right_pulmonary_artery',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_artery_R'],
    attach: 'pulmonary_trunk',
    vessel: true,
    maxTriangles: 3178,
  },
  {
    id: 'left_pulmonary_artery',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_artery_L'],
    attach: 'pulmonary_trunk',
    vessel: true,
    maxTriangles: 5000,
  },
  {
    id: 'right_superior_pulmonary_vein',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_vein_R_sup'],
    attach: 'left_atrium',
    vessel: true,
    maxTriangles: 1868,
  },
  {
    id: 'right_inferior_pulmonary_vein',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_vein_R_inf'],
    attach: 'left_atrium',
    vessel: true,
    maxTriangles: 2600,
  },
  {
    id: 'left_superior_pulmonary_vein',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_vein_L_sup'],
    attach: 'left_atrium',
    vessel: true,
    maxTriangles: 1834,
  },
  {
    id: 'left_inferior_pulmonary_vein',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_vein_L_inf'],
    attach: 'left_atrium',
    vessel: true,
    maxTriangles: 2026,
  },
  {
    id: 'aorta',
    source: 'vessels',
    nodes: ['VH_M_ascending_aorta', 'VH_M_aortic_arch', 'VH_M_descending_aorta_a'],
    attach: 'aortic_valve',
    vessel: true,
    minY: 0.445,
    maxTriangles: 9000,
  },
  {
    id: 'brachiocephalic_artery',
    source: 'vessels',
    nodes: ['VH_M_brachiocephalic_artery_a'],
    attach: 'aorta',
    vessel: true,
    maxTriangles: 446,
  },
  {
    id: 'left_common_carotid_artery',
    source: 'vessels',
    nodes: ['VH_M_left_common_carotid_artery_a'],
    attach: 'aorta',
    vessel: true,
    maxTriangles: 630,
  },
  {
    id: 'left_subclavian_artery',
    source: 'vessels',
    nodes: ['VH_M_left_subclavian_artery_a'],
    attach: 'aorta',
    vessel: true,
    maxTriangles: 589,
  },
  // Coronary arteries
  // Both coronary arteries start in the aortic root, just above the valve cusps.
  {
    id: 'left_main_coronary_artery',
    source: 'vessels',
    nodes: ['VH_M_left_coronary_artery'],
    attach: 'aortic_valve',
    vessel: true,
    maxTriangles: 2400,
  },
  {
    id: 'left_anterior_descending_artery',
    source: 'vessels',
    nodes: ['VH_M_left_anterior_descending_artery'],
    attach: 'left_main_coronary_artery',
    vessel: true,
    maxTriangles: 4500,
  },
  {
    id: 'diagonal_branches',
    source: 'vessels',
    nodes: [
      'VH_M_diagonal_branch_of_left_anterior_descending_artery',
      'VH_M_diagonal_branch_of_anterior_descending_branch_of_left_coronary_artery',
    ],
    attach: 'left_anterior_descending_artery',
    vessel: true,
    maxTriangles: 3000,
  },
  {
    id: 'left_marginal_branch',
    source: 'vessels',
    nodes: ['VH_M_left_marginal_branch'],
    attach: 'diagonal_branches',
    vessel: true,
    maxTriangles: 1948,
  },
  {
    id: 'right_coronary_artery',
    source: 'vessels',
    nodes: ['VH_M_right_coronary_artery'],
    attach: 'aortic_valve',
    vessel: true,
    maxTriangles: 5500,
  },
  {
    id: 'right_marginal_artery',
    source: 'vessels',
    nodes: ['VH_M_right_marginal_artery'],
    attach: 'right_coronary_artery',
    vessel: true,
    maxTriangles: 2120,
  },
  {
    id: 'posterior_descending_artery',
    source: 'vessels',
    nodes: ['VH_M_right_posterior_descending_artery'],
    attach: 'right_coronary_artery',
    vessel: true,
    maxTriangles: 3000,
  },
  // Cardiac veins
  {
    id: 'coronary_sinus',
    source: 'vessels',
    nodes: ['VH_M_coronary_sinus'],
    attach: 'right_atrium',
    vessel: true,
    maxTriangles: 1334,
  },
  {
    id: 'great_cardiac_vein',
    source: 'vessels',
    nodes: ['VH_M_great_cardiac_vein'],
    attach: 'coronary_sinus',
    vessel: true,
    maxTriangles: 556,
  },
  {
    id: 'middle_cardiac_vein',
    source: 'vessels',
    nodes: ['VH_M_middle_cardiac_vein'],
    attach: 'coronary_sinus',
    vessel: true,
    maxTriangles: 642,
  },
  {
    id: 'small_cardiac_vein',
    source: 'vessels',
    nodes: ['VH_M_small_cardiac_vein'],
    attach: 'coronary_sinus',
    vessel: true,
    maxTriangles: 1802,
  },
  {
    id: 'anterior_cardiac_veins',
    source: 'vessels',
    nodes: ['VH_M_anterior_cardiac_vein'],
    attach: 'right_atrium',
    vessel: true,
    maxTriangles: 375,
  },
]

/** Chordae tendineae: not in the atlas, so they are drawn as thin cords from each papillary tip to its valve. */
const CHORDAE = {
  id: 'chordae_tendineae',
  attach: 'papillary_muscles',
  perMuscle: 5,
  radius: 0.00045,
  maxTriangles: 3000,
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  )

async function fetchSource(url: string, file: string) {
  if (await exists(file)) return
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
}

function findNode(doc: Document, name: string): Node {
  const node = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === name)
  if (!node) throw new Error(`Node not found: ${name}`)
  return node
}

function trimBelow(data: MeshData, minY: number): MeshData {
  const keep: number[] = []
  const p = data.positions
  for (let i = 0; i < data.indices.length; i += 3) {
    const [a, b, c] = [data.indices[i], data.indices[i + 1], data.indices[i + 2]]
    const cy = (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3
    if (cy >= minY) keep.push(a, b, c)
  }
  return { ...data, indices: new Uint32Array(keep) }
}

const centroidOf = (d: MeshData): Vec3 => {
  const p = d.positions
  const n = p.length / 3
  const c: Vec3 = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += p[i * 3 + a] / n
  return c
}

/** Cords from each papillary muscle's tip to the nearer valve's free edge, spread across it. */
function chordae(muscles: MeshData[], valves: MeshData[]): MeshData {
  const cords: MeshData[] = []
  const valveCenters = valves.map(centroidOf)
  for (const muscle of muscles) {
    const mc = centroidOf(muscle)
    const vi =
      valveCenters[0].reduce((s, x, a) => s + (x - mc[a]) ** 2, 0) <
      valveCenters[1].reduce((s, x, a) => s + (x - mc[a]) ** 2, 0)
        ? 0
        : 1
    const valve = valves[vi]
    const target = valveCenters[vi]
    // Tip: the muscle vertex nearest the valve.
    const mp = muscle.positions
    let tip = 0
    let best = Infinity
    for (let i = 0; i < mp.length / 3; i++) {
      const d = Math.hypot(mp[i * 3] - target[0], mp[i * 3 + 1] - target[1], mp[i * 3 + 2] - target[2])
      if (d < best) {
        best = d
        tip = i
      }
    }
    const tipP = new Vector3(mp[tip * 3], mp[tip * 3 + 1], mp[tip * 3 + 2])
    // Candidate anchors: valve vertices in the band nearest the tip, then spread by farthest-point picks.
    const vp = valve.positions
    const byDist: { i: number; d: number }[] = []
    for (let i = 0; i < vp.length / 3; i++)
      byDist.push({ i, d: tipP.distanceTo(new Vector3(vp[i * 3], vp[i * 3 + 1], vp[i * 3 + 2])) })
    byDist.sort((a, b) => a.d - b.d)
    const band = byDist
      .filter((x) => x.d < byDist[0].d + 0.007)
      .map((x) => new Vector3(vp[x.i * 3], vp[x.i * 3 + 1], vp[x.i * 3 + 2]))
    const anchors = [band[0]]
    while (anchors.length < CHORDAE.perMuscle && anchors.length < band.length) {
      let far = band[0]
      let farD = -1
      for (const p of band) {
        const d = Math.min(...anchors.map((a) => a.distanceTo(p)))
        if (d > farD) {
          farD = d
          far = p
        }
      }
      anchors.push(far)
    }
    for (const a of anchors) {
      // A slight sag toward the ventricle wall, like a cord under light tension.
      const mid = tipP
        .clone()
        .lerp(a, 0.5)
        .add(new Vector3(mc[0], mc[1], mc[2]).sub(tipP).multiplyScalar(0.08))
      const curve = new CatmullRomCurve3([tipP.clone(), mid, a.clone()])
      cords.push(placed(new TubeGeometry(curve, 10, CHORDAE.radius, 5, false)))
    }
  }
  return mergeMeshData(cords)
}

await mkdir(CACHE, { recursive: true })
await mkdir('public/models', { recursive: true })
await fetchSource(SOURCES.heart.url, SOURCES.heart.file)
await fetchSource(SOURCES.vessels.url, SOURCES.vessels.file)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const docs = { heart: await io.read(SOURCES.heart.file), vessels: await io.read(SOURCES.vessels.file) }

const meshes = new Map<string, MeshData>()
for (const spec of PARTS) {
  let data = mergeMeshData(spec.nodes.map((name) => worldMeshData(findNode(docs[spec.source], name))))
  if (spec.minY !== undefined) data = trimBelow(data, spec.minY)
  meshes.set(spec.id, data)
}
const papillary = PARTS.find((p) => p.id === 'papillary_muscles')!.nodes.map((name) =>
  worldMeshData(findNode(docs.heart, name)),
)
meshes.set(CHORDAE.id, chordae(papillary, [meshes.get('tricuspid_valve')!, meshes.get('mitral_valve')!]))

const parts: OutputPart[] = [
  ...PARTS.map((spec) => ({ id: spec.id, data: meshes.get(spec.id)!, maxTriangles: spec.maxTriangles })),
  { id: CHORDAE.id, data: meshes.get(CHORDAE.id)!, maxTriangles: CHORDAE.maxTriangles },
]

// Center the whole model on the heart muscle (chambers), not the vessels.
const chambers = parts.filter((p) =>
  ['right_atrium', 'left_atrium', 'right_ventricle', 'left_ventricle'].includes(p.id),
)
const b = boundsOf(mergeMeshData(chambers.map((p) => p.data)).positions)
const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
const local = (v: Vec3): Vec3 => [
  +(v[0] - origin[0]).toFixed(5),
  +(v[1] - origin[1]).toFixed(5),
  +(v[2] - origin[2]).toFixed(5),
]

// Where each part joins the one it attaches to, in GLB root space (the same space as the part nodes).
const connections: Record<string, { to: string; pos: Vec3; normal: Vec3; path?: Vec3[] }> = {}
const specs = [...PARTS, { id: CHORDAE.id, attach: CHORDAE.attach, vessel: false }]
for (const spec of specs) {
  if (!spec.attach) continue
  const j = junction(meshes.get(spec.id)!, meshes.get(spec.attach)!)
  const entry: (typeof connections)[string] = {
    to: spec.attach,
    pos: local(j.pos),
    normal: j.normal.map((x) => +x.toFixed(4)) as Vec3,
  }
  if (spec.vessel) entry.path = centerline(meshes.get(spec.id)!, j.pos).map(local)
  connections[spec.id] = entry
  const gap = j.gap > 0 ? `  gap ${(j.gap * 1000).toFixed(1)} mm` : ''
  console.log(
    `${spec.id.padEnd(32)} → ${spec.attach.padEnd(26)}${entry.path ? ` path ${entry.path.length}` : ''}${gap}`,
  )
}

await writePartsGlb('public/models/heart.glb', 'heart', parts, origin, { connections })
