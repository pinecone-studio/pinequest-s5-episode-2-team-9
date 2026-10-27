// Builds public/models/brain.glb from the Human Reference Atlas (HuBMAP)
// 3D Reference Organ for Brain, Male (Allen Human Brain Atlas structures on
// the Visible Human Male), CC BY 4.0. 283 structures are grouped into 23 parts
// at high-school level. The forebrain white-matter mass is left out so the
// lobes and deep structures stay visible.
//
// Usage: npx tsx scripts/build-brain.ts
import { NodeIO, type Document, type Node } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { boundsOf, mergeMeshData, recomputeNormals, worldMeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb, type OutputPart } from './lib/output'

const CACHE = 'scripts/.cache'
const URL = 'https://cdn.humanatlas.io/digital-objects/ref-organ/brain-male/v1.3/assets/3d-vh-m-allen-brain.glb'
const FILE = `${CACHE}/brain-male.glb`

// The atlas's two hemispheres are mirror copies, and its "_L" structures lie on
// -x, which in the shared reference frame is the patient's RIGHT (the heart
// model, in the same frame, has its right atrium on -x). We label sides by
// position so left/right agree with the heart.
const PATIENT_RIGHT = 'L'
const PATIENT_LEFT = 'R'

const both = (...bases: string[]) => bases.flatMap((b) => [`Allen_${b}_L`, `Allen_${b}_R`])
const side = (s: string, ...bases: string[]) => bases.map((b) => `Allen_${b}_${s}`)

const FRONTAL = [
  'precentral_gyrus',
  'superior_frontal_gyrus',
  'middle_frontal_gyrus',
  'inferior_frontal_gyrus_triangular_part',
  'inferior_frontal_gyrus_opercular_part',
  'gyrus_rectus_straight_gyrus',
  'medial_orbital_gyrus',
  'anterior_intermediate_orbital_gyrus',
  'posterior_intermediate_orbital_gyrus',
  'lateral_orbital_gyrus',
  'paracentral_lobule_rostral_part',
  'frontal_operculum',
  'paracingulate_gyrus',
  'rostral_gyrus',
  'frontomarginal_gyrus',
  'frontal_pole',
]
const PARIETAL = [
  'postcentral_gyrus',
  'supraparietal_lobule',
  'supramarginal_gyrus',
  'angular_gyrus',
  'precuneus',
  'paracentral_lobule_caudal_part',
  'parietal_operculum',
]
const TEMPORAL = [
  'superior_temporal_gyrus',
  'middle_temporal_gyrus',
  'inferior_temporal_gyrus',
  'occipitotemporal_fusiform_gyrus_temporal_part',
  'transverse_temporal_gyrus_Heschls_gyrus',
  'planum_temporale',
  'temporal_pole',
  'planum_polare',
  'perirhinal_gyrus_rostral_part_of_FuGt',
]
const OCCIPITAL = [
  'occipital_pole',
  'cuneus',
  'lingual_gyrus_medial_occipitotemporal_gyrus',
  'lateral_occipitotemporal_fusiform_gyrus_occipital_part',
  'inferior_occipital_gyrus',
  'superior_occipital_gyrus',
]

interface PartSpec {
  id: string
  nodes: string[]
  maxTriangles: number
}

const PARTS: PartSpec[] = [
  { id: 'frontal_lobe_left', nodes: side(PATIENT_LEFT, ...FRONTAL), maxTriangles: 9000 },
  { id: 'frontal_lobe_right', nodes: side(PATIENT_RIGHT, ...FRONTAL), maxTriangles: 9000 },
  { id: 'parietal_lobe_left', nodes: side(PATIENT_LEFT, ...PARIETAL), maxTriangles: 7000 },
  { id: 'parietal_lobe_right', nodes: side(PATIENT_RIGHT, ...PARIETAL), maxTriangles: 7000 },
  { id: 'temporal_lobe_left', nodes: side(PATIENT_LEFT, ...TEMPORAL), maxTriangles: 7000 },
  { id: 'temporal_lobe_right', nodes: side(PATIENT_RIGHT, ...TEMPORAL), maxTriangles: 7000 },
  { id: 'occipital_lobe_left', nodes: side(PATIENT_LEFT, ...OCCIPITAL), maxTriangles: 6000 },
  { id: 'occipital_lobe_right', nodes: side(PATIENT_RIGHT, ...OCCIPITAL), maxTriangles: 6000 },
  {
    id: 'insula',
    nodes: both(
      'long_insular_gyri',
      'short_insular_gyri',
      'limen_insula',
      'frontal_agranular_insular_cortex_area_Fl',
      'temporal_agranular_insular_cortex_area_Tl',
    ),
    maxTriangles: 3500,
  },
  {
    id: 'limbic_cortex',
    nodes: both(
      'cingulate_gyrus_rostral_anterior_part',
      'cingulate_gyrus_caudal_posterior_part',
      'ingulo_parahippocampal_isthmus',
      'subcallosal_gyrus_parolfactory_gyrus',
      'anterior_parahippocampal_gyrus',
      'posterior_parahippocampal_gyrus',
      'gyrus_ambiens',
      'piriform_region',
      'septal_nuclei',
      'basal_forebrain',
    ),
    maxTriangles: 6000,
  },
  {
    id: 'hippocampus',
    nodes: both('head_of_hippocampus', 'body_of_hippocampus', 'tail_of_hippocampus', 'fornix'),
    maxTriangles: 3000,
  },
  {
    id: 'amygdala',
    nodes: both(
      'amygdaloid_complex',
      'anterior_amygdaloid_area',
      'central_nuclear_group',
      'lateral_nucleus',
      'basolateral_nucleus_basal_nucleus',
      'basomedial_nucleus_accessory_basal_nucleus',
      'anterior_cortical_nucleus',
      'posterior_cortical_nucleus',
      'medial_nucleus',
      'amygdalohippocampal_area',
      'bed_nucleus_of_stria_terminalis',
    ),
    maxTriangles: 2500,
  },
  {
    id: 'basal_ganglia',
    nodes: both(
      'head_of_caudate',
      'body_of_caudate',
      'tail_of_caudate',
      'putamen',
      'posteroventral_putamen',
      'nucleus_accumbens',
      'external_segment_of_globus_pallidus',
      'internal_segment_of_globus_pallidus',
      'claustrum',
      'subthalamic_nucleus',
      'substantia_nigra',
    ),
    maxTriangles: 6000,
  },
  {
    id: 'thalamus',
    nodes: both(
      'thalamus',
      'anterior_nuclear_complex_of_thalamus',
      'lateral_dorsal_nucleus_of_thalamus',
      'mediodorsal_nucleus_of_thalamus',
      'reuniens_nucleus_medioventral_nucleus_of_thalamus',
      'lateral_posterior_nucleus_of_thalamus',
      'pulvinar_of_thalamus',
      'ventral_anterior_nucleus_of_thalamus',
      'ventral_lateral_nucleus_of_thalamus',
      'ventral_posterior_lateral_nucleus',
      'ventral_posterior_medial_nucleus',
      'dorsal_lateral_geniculate_nucleus',
      'medial_geniculate_nuclei',
      'centromedian_nucleus_of_thalamus',
      'parafascicular_nucleus_of_thalamus',
      'zona_incerta',
      'midline_nuclear_complex',
    ),
    maxTriangles: 5000,
  },
  {
    id: 'hypothalamus',
    nodes: both(
      'hypothalamus',
      'supraoptic_region_of_HTH',
      'preoptic_region_of_HTH',
      'tuberal_region_of_HTH',
      'mammillary_region_of_HTH',
      'mammillothalamic_tract',
    ),
    maxTriangles: 2000,
  },
  { id: 'corpus_callosum', nodes: both('corpus_callosum', 'anterior_commissure'), maxTriangles: 4000 },
  {
    id: 'ventricles',
    nodes: both(
      'anterior_horn_of_lateral_ventricle',
      'body_of_lateral_ventricle',
      'posterior_horn_of_lateral_ventricle',
      'inferior_horn_of_lateral_ventricle',
      'atrium_of_lateral_ventricle',
      'third_ventricle',
      'fourth_ventricle',
      'cerebral_aqueduct',
      'central_canal_of_medulla_oblongata',
    ),
    maxTriangles: 4000,
  },
  {
    id: 'cerebellum',
    nodes: both(
      'cerebellar_vermis',
      'paravermis_of_cerebellum',
      'lateral_hemisphere_of_cerebellum',
      'cerebellar_deep_nuclei',
      'superior_cerebellar_peduncle_brachium_conjunctivum',
      'middle_cerebellar_peduncle',
      'inferior_cerebellar_peduncle',
    ),
    maxTriangles: 9000,
  },
  {
    id: 'brainstem',
    nodes: both(
      'midbrain_tegmentum',
      'cerebral_peduncle_crus_cerebri',
      'superior_colliculus',
      'inferior_colliculus',
      'red_nucleus',
      'pretectal_region',
      'basilar_part_of_pons',
      'pontine_tegmentum',
      'pyramidal_part_of_medulla_oblongata',
      'tegmentum_of_medulla_oblongata',
      'inferior_olive',
      'white_matter_of_hindbrain',
    ),
    maxTriangles: 5000,
  },
  {
    id: 'olfactory_pathway',
    nodes: both('olfactory_bulb', 'anterior_olfactory_nucleus', 'olfactory_tract', 'lateral_olfactory_gyrus'),
    maxTriangles: 800,
  },
  {
    id: 'visual_pathway',
    nodes: ['VH_M_optic_chiasm', ...both('optic_tract', 'optic_radiation')],
    maxTriangles: 2000,
  },
  { id: 'pineal_gland', nodes: both('pineal_body', 'habenular_nuclei'), maxTriangles: 400 },
]

const exists = (p: string) => stat(p).then(() => true, () => false)

await mkdir(CACHE, { recursive: true })
await mkdir('public/models', { recursive: true })
if (!(await exists(FILE))) {
  console.log(`Downloading ${URL}`)
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  await writeFile(FILE, Buffer.from(await res.arrayBuffer()))
}

const doc: Document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(FILE)
const byName = new Map<string, Node>(doc.getRoot().listNodes().map((n) => [n.getName(), n]))

const used = new Set<string>()
const parts: OutputPart[] = PARTS.map((spec) => {
  const meshes = spec.nodes
    .map((name) => {
      const node = byName.get(name)
      // Some structures exist on one side only in the atlas; skip silently.
      if (!node?.getMesh()) return null
      used.add(name)
      return worldMeshData(node)
    })
    .filter((m) => m !== null)
  if (!meshes.length) throw new Error(`No meshes for ${spec.id}`)
  // The atlas meshes carry unusable normals; rebuild smooth ones for lit rendering.
  return { id: spec.id, data: recomputeNormals(mergeMeshData(meshes)), maxTriangles: spec.maxTriangles }
})

const unused = [...byName.values()].filter((n) => n.getMesh() && !used.has(n.getName())).map((n) => n.getName())
console.log(`Unused structures (${unused.length}): ${unused.join(', ')}`)

const b = boundsOf(mergeMeshData(parts.map((p) => p.data)).positions)
const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
console.log('bounds', b)
await writePartsGlb('public/models/brain.glb', 'brain', parts, origin)
