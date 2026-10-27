import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: electricMotor.tour.<id>.title / .text in src/i18n.
export const electricMotorTour: TourStep[] = [
  { id: 'overview' },
  { id: 'magnets', part: 'north_magnet', cutaway: 0.5 },
  { id: 'armature', part: 'windings', cutaway: 0.5 },
  { id: 'commutator', part: 'commutator' },
  { id: 'brushes', part: 'brushes' },
  { id: 'shaft', part: 'shaft' },
  { id: 'fan', part: 'fan' },
  { id: 'spin', motion: true },
]
