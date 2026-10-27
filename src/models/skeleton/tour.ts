import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: skeleton.tour.<id>.title / .text in src/i18n.
export const skeletonTour: TourStep[] = [
  { id: 'overview' },
  { id: 'skull', part: 'cranium' },
  { id: 'jaw', part: 'mandible' },
  { id: 'spine', part: 'thoracic_spine' },
  { id: 'lower_back', part: 'lumbar_spine' },
  { id: 'ribs', part: 'ribs_left' },
  { id: 'pelvis', part: 'hip_bone_left' },
  { id: 'arm', part: 'humerus_left' },
  { id: 'leg', part: 'femur_left' },
]
