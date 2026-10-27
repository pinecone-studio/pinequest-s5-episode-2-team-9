import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: heart.tour.<id>.title / .text in src/i18n.
export const heartTour: TourStep[] = [
  { id: 'overview' },
  { id: 'veins_in', part: 'superior_vena_cava' },
  { id: 'right_atrium', part: 'right_atrium' },
  { id: 'tricuspid', part: 'tricuspid_valve', cutaway: 0.45 },
  { id: 'right_ventricle', part: 'right_ventricle' },
  { id: 'to_lungs', part: 'pulmonary_trunk' },
  { id: 'from_lungs', part: 'pulmonary_veins' },
  { id: 'mitral', part: 'mitral_valve', cutaway: 0.45 },
  { id: 'left_ventricle', part: 'left_ventricle' },
  { id: 'aorta', part: 'aorta' },
  { id: 'coronary', part: 'left_coronary_artery' },
  { id: 'beat', motion: true },
]
