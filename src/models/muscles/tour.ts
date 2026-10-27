import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: muscles.tour.<id>.title / .text in src/i18n.
export const musclesTour: TourStep[] = [
  { id: 'overview' },
  { id: 'diaphragm', part: 'diaphragm' },
  { id: 'abdominals', part: 'abdominal_wall' },
  { id: 'trapezius', part: 'trapezius' },
  { id: 'lats', part: 'latissimus_dorsi_left' },
  { id: 'arm_pair', part: 'biceps_brachii_left' },
  { id: 'quadriceps', part: 'quadriceps_left' },
  { id: 'calf', part: 'calf_left' },
  { id: 'face', part: 'face_muscles' },
]
