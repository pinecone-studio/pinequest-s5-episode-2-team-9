import type { ModelDefinition, PartDef, PieceDef } from '../ModelDefinition'
import counts from './counts.json'
import { lungsTour } from './tour'

// Lung tissue pink, airways cyan, oxygen-poor blood blue, oxygen-rich blood red, muscle violet.
const AIRWAY = '#7ff3ff'
const BLUE = '#5aa8ff'
const RED = '#ff5d6c'
const VIOLET = '#b18cff'

// Segments are coloured by their number (S1-S10), the same on both sides, as in anatomy atlases.
const SEGMENT_COLORS: Record<string, string> = {
  apical: '#ff6b8b', // S1
  posterior: '#ffa94d', // S2
  anterior: '#ffd84d', // S3
  lateral: '#8bf06a', // S4 (right)
  superior_lingular: '#8bf06a', // S4 (left)
  medial: '#3fe0c4', // S5 (right)
  inferior_lingular: '#3fe0c4', // S5 (left)
  superior: '#4db8ff', // S6
  medial_basal: '#8f93ff', // S7
  anterior_basal: '#c77dff', // S8
  lateral_basal: '#ff7ad9', // S9
  posterior_basal: '#ff5c5c', // S10
}

const pad = (k: number) => String(k).padStart(2, '0')
const numbered = (prefix: string, info: string, n: number): PieceDef[] =>
  Array.from({ length: n }, (_, k) => ({ id: `${prefix}_${pad(k + 1)}`, info, n: k + 1 }))

type LobeId = keyof typeof counts.lobules

/** A lobe's bronchopulmonary segments, each made of its secondary pulmonary lobules. */
function segments(lobe: LobeId, side: 'right' | 'left'): PieceDef[] {
  return Object.entries(counts.lobules[lobe]).map(([id, n]) => ({
    id,
    info: `${side}_${id}`,
    color: SEGMENT_COLORS[id],
    pieces: numbered('lobule', 'lobule', n).map((p) => ({ ...p, look: 'lungTissue' as const })),
  }))
}

const RIGHT_AIRWAYS = [
  'upper_lobe_bronchus',
  'intermediate_bronchus',
  'middle_lobe_bronchus',
  'lower_lobe_bronchus',
  'apical_bronchus',
  'posterior_bronchus',
  'anterior_bronchus',
  'lateral_bronchus',
  'medial_bronchus',
  'superior_bronchus',
  'medial_basal_bronchus',
  'anterior_basal_bronchus',
  'lateral_basal_bronchus',
  'posterior_basal_bronchus',
]
const LEFT_AIRWAYS = [
  'upper_lobe_bronchus',
  'lower_lobe_bronchus',
  'apicoposterior_bronchus',
  'anterior_bronchus',
  'lingular_bronchus',
  'superior_lingular_bronchus',
  'inferior_lingular_bronchus',
  'superior_bronchus',
  'medial_basal_bronchus',
  'anterior_basal_bronchus',
  'lateral_basal_bronchus',
  'posterior_basal_bronchus',
]

/** A bronchial tree: the main bronchus, then every lobar and segmental bronchus (wall + cartilage). */
function bronchialTree(side: 'right' | 'left'): PieceDef[] {
  const withCartilage = new Set<string>(counts.cartilage[side])
  const ids = side === 'right' ? RIGHT_AIRWAYS : LEFT_AIRWAYS
  return [
    {
      id: 'main_bronchus',
      info: `${side}_main_bronchus`,
      pieces: [
        { id: 'cartilage', info: 'main_bronchus_rings', look: 'cartilage' },
        { id: 'wall', info: 'main_bronchus_wall', look: 'airway' },
      ],
    },
    ...ids.map((id) => ({
      id,
      info: `${side}_${id}`,
      ...(withCartilage.has(id) && {
        pieces: [
          { id: 'wall', info: 'bronchial_wall', look: 'airway' as const },
          { id: 'cartilage', info: 'bronchial_cartilage', look: 'cartilage' as const },
        ],
      }),
    })),
  ]
}

const lobe = (id: LobeId, side: 'right' | 'left', color: string, dependsOn: string[], extra: Partial<PartDef> = {}): PartDef => ({
  id,
  group: 'lobes',
  color,
  dependsOn,
  hint: `${side}_lobe`,
  pieces: segments(id, side),
  ...extra,
})

export const lungs: ModelDefinition = {
  id: 'lungs',
  slug: 'lungs',
  url: '/models/lungs.glb',
  groups: ['airways', 'lobes', 'vessels', 'breathing'],
  baseParts: ['trachea'],
  cutaway: true,
  edges: false,
  glow: 0.8,
  initialRotation: [0.12, -0.3, 0],
  tour: lungsTour,
  accent: '#ff8fb3',
  sources: [
    {
      text: 'Human Reference Atlas. 3D Reference Organ for Lung, Male, v1.3. HuBMAP.',
      url: 'https://cdn.humanatlas.io/digital-objects/ref-organ/lung-male/v1.3/assets/3d-vh-m-lung.glb',
    },
    {
      text: 'Browne, K. & Schlehlein, H. (2024). 3D Reference Organ for Blood Vasculature, Male, v1.3. HuBMAP.',
      url: 'https://doi.org/10.48539/HBM473.XTPP.725',
    },
    { text: 'Creative Commons Attribution 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  ],
  motion: 'lungs',
  looks: {
    default: 'lung',
    trachea: 'cartilage',
    airways: 'airway',
    pulmonary_arteries: 'vein',
    pulmonary_veins: 'artery',
    diaphragm: 'muscle',
  },
  parts: [
    {
      id: 'trachea',
      group: 'airways',
      color: AIRWAY,
      dependsOn: [],
      explodeScale: 0.5,
      explodeDir: [0, 1, 0],
      pieces: [
        { id: 'cartilage_rings', look: 'cartilage', pieces: numbered('ring', 'tracheal_ring', counts.tracheaRings) },
        { id: 'trachealis', look: 'smoothMuscle', color: '#ff9fb0' },
        { id: 'annular_ligaments', look: 'ligament', color: '#ffe3a8' },
        { id: 'mucosa', look: 'mucosa', color: '#ff8fb3' },
      ],
    },
    { id: 'right_bronchial_tree', group: 'airways', color: AIRWAY, dependsOn: ['trachea'], hint: 'bronchial_tree', pieces: bronchialTree('right') },
    { id: 'left_bronchial_tree', group: 'airways', color: AIRWAY, dependsOn: ['trachea'], hint: 'bronchial_tree', pieces: bronchialTree('left') },
    lobe('right_upper_lobe', 'right', '#ff9fc4', ['right_bronchial_tree']),
    lobe('right_middle_lobe', 'right', '#ffb3a1', ['right_bronchial_tree']),
    lobe('right_lower_lobe', 'right', '#ff8fa8', ['right_bronchial_tree']),
    lobe('left_upper_lobe', 'left', '#f7a6ff', ['left_bronchial_tree']),
    lobe('left_lower_lobe', 'left', '#ff94c9', ['left_bronchial_tree']),
    {
      id: 'pulmonary_arteries',
      group: 'vessels',
      color: BLUE,
      dependsOn: ['right_bronchial_tree', 'left_bronchial_tree'],
      explodeScale: 0.7,
      pieces: [{ id: 'pulmonary_trunk' }, { id: 'right_pulmonary_artery' }, { id: 'left_pulmonary_artery' }],
    },
    {
      id: 'pulmonary_veins',
      group: 'vessels',
      color: RED,
      dependsOn: ['pulmonary_arteries'],
      explodeScale: 0.7,
      pieces: [{ id: 'right_superior_vein' }, { id: 'right_inferior_vein' }, { id: 'left_superior_vein' }, { id: 'left_inferior_vein' }],
    },
    {
      id: 'diaphragm',
      group: 'breathing',
      color: VIOLET,
      dependsOn: ['right_lower_lobe', 'left_lower_lobe'],
      explodeDir: [0, -1, 0],
      pieces: [
        { id: 'central_tendon', look: 'tendon', color: '#e3d6ff' },
        { id: 'right_dome' },
        { id: 'left_dome' },
        { id: 'right_crus' },
        { id: 'left_crus' },
      ],
    },
  ],
}
