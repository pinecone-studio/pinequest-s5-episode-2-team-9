// Builds public/models/heart.glb from the Human Reference Atlas (HuBMAP)
// Visible Human Male heart + blood vasculature reference organs (CC BY 4.0).
// Both files share one coordinate frame (metres, +y up, +z anterior), so the
// vessels line up with the heart without any transform.
//
// Usage: npx tsx scripts/build-heart.ts
import { NodeIO, type Document, type Node } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { boundsOf, mergeMeshData, worldMeshData, type MeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb, type OutputPart } from './lib/output'

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
  /** Keep only triangles whose centroid has y above this (trims long vessels). */
  minY?: number
  maxTriangles: number
}

// Our 18 parts. Node names are the atlas's own.
const PARTS: PartSpec[] = [
  { id: 'right_atrium', source: 'heart', nodes: ['VH_M_right_cardiac_atrium'], maxTriangles: 17100 },
  { id: 'left_atrium', source: 'heart', nodes: ['VH_M_left_cardiac_atrium'], maxTriangles: 15200 },
  { id: 'right_ventricle', source: 'heart', nodes: ['VH_M_heart_right_ventricle'], maxTriangles: 17100 },
  { id: 'left_ventricle', source: 'heart', nodes: ['VH_M_heart_left_ventricle'], maxTriangles: 13300 },
  { id: 'septum', source: 'heart', nodes: ['VH_M_interventricular_septum'], maxTriangles: 7600 },
  { id: 'tricuspid_valve', source: 'heart', nodes: ['VH_M_tricuspid_valve'], maxTriangles: 6600 },
  { id: 'mitral_valve', source: 'heart', nodes: ['VH_M_mitral_valve'], maxTriangles: 5700 },
  { id: 'pulmonary_valve', source: 'heart', nodes: ['VH_M_pulmonary_valve'], maxTriangles: 5700 },
  { id: 'aortic_valve', source: 'heart', nodes: ['VH_M_aortic_valve'], maxTriangles: 4800 },
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
    maxTriangles: 3800,
  },
  {
    id: 'aorta',
    source: 'vessels',
    nodes: [
      'VH_M_ascending_aorta',
      'VH_M_aortic_arch',
      'VH_M_descending_aorta_a',
      'VH_M_brachiocephalic_artery_a',
      'VH_M_left_common_carotid_artery_a',
      'VH_M_left_subclavian_artery_a',
    ],
    minY: 0.445,
    maxTriangles: 13300,
  },
  {
    id: 'pulmonary_trunk',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_trunk', 'VH_M_pulmonary_artery_L', 'VH_M_pulmonary_artery_R'],
    maxTriangles: 11400,
  },
  {
    id: 'pulmonary_veins',
    source: 'vessels',
    nodes: ['VH_M_pulmonary_vein_R_inf', 'VH_M_pulmonary_vein_R_sup', 'VH_M_pulmonary_vein_L_inf', 'VH_M_pulmonary_vein_L_sup'],
    maxTriangles: 7600,
  },
  { id: 'superior_vena_cava', source: 'vessels', nodes: ['VH_M_superior_vena_cava'], maxTriangles: 6600 },
  { id: 'inferior_vena_cava', source: 'vessels', nodes: ['VH_M_inferior_vena_cava_a'], minY: 0.412, maxTriangles: 4800 },
  {
    id: 'left_coronary_artery',
    source: 'vessels',
    nodes: [
      'VH_M_left_coronary_artery',
      'VH_M_diagonal_branch_of_left_anterior_descending_artery',
      'VH_M_diagonal_branch_of_anterior_descending_branch_of_left_coronary_artery',
    ],
    maxTriangles: 7600,
  },
  { id: 'right_coronary_artery', source: 'vessels', nodes: ['VH_M_right_coronary_artery'], maxTriangles: 6600 },
  {
    id: 'cardiac_veins',
    source: 'vessels',
    nodes: [
      'VH_M_great_cardiac_vein',
      'VH_M_middle_cardiac_vein',
      'VH_M_small_cardiac_vein',
      'VH_M_anterior_cardiac_vein',
      'VH_M_coronary_sinus',
    ],
    maxTriangles: 6600,
  },
]

const exists = (p: string) => stat(p).then(() => true, () => false)

async function fetchSource(url: string, file: string) {
  if (await exists(file)) return
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
}

function findNode(doc: Document, name: string): Node {
  const node = doc.getRoot().listNodes().find((n) => n.getName() === name)
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

await mkdir(CACHE, { recursive: true })
await mkdir('public/models', { recursive: true })
await fetchSource(SOURCES.heart.url, SOURCES.heart.file)
await fetchSource(SOURCES.vessels.url, SOURCES.vessels.file)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const docs = { heart: await io.read(SOURCES.heart.file), vessels: await io.read(SOURCES.vessels.file) }

const parts: OutputPart[] = PARTS.map((spec) => {
  let data = mergeMeshData(spec.nodes.map((name) => worldMeshData(findNode(docs[spec.source], name))))
  if (spec.minY !== undefined) data = trimBelow(data, spec.minY)
  return { id: spec.id, data, maxTriangles: spec.maxTriangles }
})

// Center the whole model on the heart muscle (chambers), not the vessels.
const chambers = parts.filter((p) => ['right_atrium', 'left_atrium', 'right_ventricle', 'left_ventricle'].includes(p.id))
const b = boundsOf(mergeMeshData(chambers.map((p) => p.data)).positions)
const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]

await writePartsGlb('public/models/heart.glb', 'heart', parts, origin)
