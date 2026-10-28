import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: lungs.tour.<id>.title / .text in src/i18n.
export const lungsTour: TourStep[] = [
  { id: 'overview' },
  { id: 'trachea', part: 'trachea' },
  { id: 'bronchi', part: 'right_bronchial_tree', cutaway: 0.4 },
  { id: 'right_lung', part: 'right_middle_lobe', explode: 0.45 },
  { id: 'left_lung', part: 'left_upper_lobe', explode: 0.45 },
  { id: 'segments', part: 'right_lower_lobe', explode: 0.7 },
  { id: 'vessels', part: 'pulmonary_arteries', explode: 0.3 },
  { id: 'diaphragm', part: 'diaphragm' },
  { id: 'breathe', motion: true },
]
