import type { ModelDefinition, PartDef } from '../ModelDefinition'

const SKULL = '#cfe9ff'
const SPINE = '#ffd27a'
const THORAX = '#7dd3fc'
const ARM = '#a78bff'
const LEG = '#5ee7ff'
const PELVIS = '#f0abfc'

const limbs: PartDef[] = (['left', 'right'] as const).flatMap((s) => [
  { id: `clavicle_${s}`, group: 'upper_limb', color: ARM, dependsOn: ['sternum'], info: 'clavicle', hint: 'clavicle' },
  { id: `scapula_${s}`, group: 'upper_limb', color: ARM, dependsOn: [`clavicle_${s}`, `ribs_${s}`], info: 'scapula', hint: 'scapula' },
  { id: `humerus_${s}`, group: 'upper_limb', color: ARM, dependsOn: [`scapula_${s}`], info: 'humerus', hint: 'humerus' },
  { id: `radius_${s}`, group: 'upper_limb', color: ARM, dependsOn: [`humerus_${s}`], info: 'radius', hint: 'forearm' },
  { id: `ulna_${s}`, group: 'upper_limb', color: ARM, dependsOn: [`humerus_${s}`], info: 'ulna', hint: 'forearm' },
  { id: `hand_${s}`, group: 'upper_limb', color: ARM, dependsOn: [`radius_${s}`, `ulna_${s}`], info: 'hand', hint: 'hand' },
  { id: `hip_bone_${s}`, group: 'lower_limb', color: PELVIS, dependsOn: ['sacrum'], info: 'hip_bone', hint: 'hip_bone' },
  { id: `femur_${s}`, group: 'lower_limb', color: LEG, dependsOn: [`hip_bone_${s}`], info: 'femur', hint: 'femur' },
  { id: `patella_${s}`, group: 'lower_limb', color: LEG, dependsOn: [`femur_${s}`], info: 'patella', hint: 'patella' },
  { id: `tibia_${s}`, group: 'lower_limb', color: LEG, dependsOn: [`femur_${s}`], info: 'tibia', hint: 'tibia' },
  { id: `fibula_${s}`, group: 'lower_limb', color: LEG, dependsOn: [`tibia_${s}`], info: 'fibula', hint: 'fibula' },
  { id: `foot_${s}`, group: 'lower_limb', color: LEG, dependsOn: [`tibia_${s}`, `fibula_${s}`], info: 'foot', hint: 'foot' },
])

export const skeleton: ModelDefinition = {
  id: 'skeleton',
  slug: 'skeleton',
  url: '/models/skeleton.glb',
  groups: ['skull', 'spine', 'thorax', 'upper_limb', 'lower_limb'],
  baseParts: ['sacrum'],
  cutaway: false,
  edges: false,
  glow: 0.75,
  initialRotation: [0.05, -0.45, 0],
  accent: SKULL,
  sources: [
    {
      text: 'BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International',
      url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
    },
  ],
  looks: { default: 'bone' },
  parts: [
    { id: 'sacrum', group: 'spine', color: SPINE, dependsOn: [], explodeScale: 0.3 },
    { id: 'lumbar_spine', group: 'spine', color: SPINE, dependsOn: ['sacrum'] },
    { id: 'thoracic_spine', group: 'spine', color: SPINE, dependsOn: ['lumbar_spine'] },
    { id: 'cervical_spine', group: 'spine', color: SPINE, dependsOn: ['thoracic_spine'] },
    { id: 'cranium', group: 'skull', color: SKULL, dependsOn: ['cervical_spine'] },
    { id: 'facial_bones', group: 'skull', color: SKULL, dependsOn: ['cranium'] },
    { id: 'mandible', group: 'skull', color: SKULL, dependsOn: ['cranium'] },
    { id: 'ribs_left', group: 'thorax', color: THORAX, dependsOn: ['thoracic_spine'], info: 'ribs', hint: 'ribs' },
    { id: 'ribs_right', group: 'thorax', color: THORAX, dependsOn: ['thoracic_spine'], info: 'ribs', hint: 'ribs' },
    { id: 'sternum', group: 'thorax', color: THORAX, dependsOn: ['ribs_left', 'ribs_right'] },
    ...limbs,
  ],
}
