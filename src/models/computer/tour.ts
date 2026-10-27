import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: computer.tour.<id>.title / .text in src/i18n.
// The computer is solid (realistic only), so inner parts are shown pulled apart.
export const computerTour: TourStep[] = [
  { id: 'overview' },
  { id: 'case', part: 'case_frame' },
  { id: 'psu', part: 'psu', explode: 0.5 },
  { id: 'motherboard', part: 'motherboard', explode: 0.5 },
  { id: 'cpu', part: 'cpu', explode: 0.5 },
  { id: 'cooler', part: 'cpu_cooler', explode: 0.5 },
  { id: 'ram', part: 'ram_1', explode: 0.5 },
  { id: 'gpu', part: 'gpu', explode: 0.5 },
  { id: 'storage', part: 'm2_ssd', explode: 0.5 },
  { id: 'airflow', part: 'front_fan', explode: 0.5 },
]
