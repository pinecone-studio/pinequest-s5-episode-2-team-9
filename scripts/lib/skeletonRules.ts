// Bone grouping rules for BodyParts3D, shared by the skeleton and muscle models.
import type { GroupRule } from './bp3d'

const DISK = 'intervertebral disk of '
const sides = ['left', 'right'] as const

const perSide = (side: 'left' | 'right'): GroupRule[] => [
  { id: `clavicle_${side}`, match: /\bclavicle$/, side, maxTriangles: 1200 },
  { id: `scapula_${side}`, match: /\bscapula$/, side, maxTriangles: 2500 },
  { id: `humerus_${side}`, match: /\bhumerus$/, side, maxTriangles: 2000 },
  { id: `radius_${side}`, match: /\bradius$/, side, maxTriangles: 1500 },
  { id: `ulna_${side}`, match: /\bulna$/, side, maxTriangles: 1500 },
  {
    id: `hand_${side}`,
    match: /\b(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate)$|metacarpal bone$|phalanx of .*(finger|thumb)$|sesamoid bone of .*hand/,
    side,
    maxTriangles: 6000,
  },
  { id: `hip_bone_${side}`, match: /\bhip bone$/, side, maxTriangles: 3500 },
  { id: `femur_${side}`, match: /\bfemur$/, side, maxTriangles: 2500 },
  { id: `patella_${side}`, match: /\bpatella$/, side, maxTriangles: 600 },
  { id: `tibia_${side}`, match: /\btibia$/, side, maxTriangles: 2000 },
  { id: `fibula_${side}`, match: /\bfibula$/, side, maxTriangles: 1200 },
  {
    id: `foot_${side}`,
    match: /\b(talus|calcaneus|navicular|cuboid bone|cuneiform bone)$|metatarsal bone$|phalanx of .*toe$|sesamoid bone of .*foot/,
    side,
    maxTriangles: 6000,
  },
]

export const SKELETON_RULES: GroupRule[] = [
  {
    id: 'cranium',
    match: /^(frontal bone|left parietal bone|right parietal bone|occipital bone|left temporal bone|right temporal bone|sphenoid bone|ethmoid)$/,
    maxTriangles: 9000,
  },
  {
    id: 'facial_bones',
    match: /(nasal bone|zygomatic bone|maxilla|palatine bone|vomer|inferior nasal concha|lacrimal bone)$/,
    maxTriangles: 6000,
  },
  { id: 'mandible', match: /^(mandible|hyoid bone)$/, maxTriangles: 2500 },
  {
    id: 'cervical_spine',
    match: new RegExp(`^(atlas|axis|\\w+ cervical vertebra|${DISK}(axis|\\w+ cervical vertebra))$`),
    maxTriangles: 5000,
  },
  {
    id: 'thoracic_spine',
    match: new RegExp(`^(\\w+ thoracic vertebra|${DISK}\\w+ thoracic vertebra)$`),
    maxTriangles: 8000,
  },
  {
    id: 'lumbar_spine',
    match: new RegExp(`^(\\w+ lumbar vertebra|${DISK}\\w+ lumbar vertebra)$`),
    maxTriangles: 5000,
  },
  { id: 'sacrum', match: /^(sacrum|coccyx)$/, maxTriangles: 2000 },
  { id: 'sternum', match: /^(manubrium|body of sternum|xiphoid process)$/, maxTriangles: 1500 },
  { id: 'ribs_left', match: /\b(rib|costal cartilage)$/, side: 'left', maxTriangles: 7000 },
  { id: 'ribs_right', match: /\b(rib|costal cartilage)$/, side: 'right', maxTriangles: 7000 },
  ...sides.flatMap(perSide),
]

