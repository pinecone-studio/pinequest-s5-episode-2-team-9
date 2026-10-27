import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: robotDog.tour.<id>.title / .text in src/i18n.
export const robotDogTour: TourStep[] = [
  { id: 'overview' },
  { id: 'frame', part: 'frame' },
  { id: 'battery', part: 'battery' },
  { id: 'controller', part: 'controller_board' },
  { id: 'lidar', part: 'lidar' },
  { id: 'servos', part: 'servos_lf' },
  { id: 'legs', part: 'lower_leg_lf' },
  { id: 'walk', motion: true },
]
