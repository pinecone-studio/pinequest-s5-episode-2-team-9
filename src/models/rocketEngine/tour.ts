import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: rocketEngine.tour.<id>.title / .text in src/i18n.
export const rocketEngineTour: TourStep[] = [
  { id: 'overview' },
  { id: 'lines', part: 'fuel_lines' },
  { id: 'valves', part: 'main_oxidizer_valve' },
  { id: 'gas_generator', part: 'gas_generator' },
  { id: 'turbopump', part: 'turbine' },
  { id: 'injector', part: 'injector' },
  { id: 'chamber', part: 'combustion_chamber', cutaway: 0.5 },
  { id: 'nozzle', part: 'nozzle' },
  { id: 'cooling', part: 'cooling_jacket' },
  { id: 'steering', part: 'gimbal' },
  { id: 'fire', motion: true },
]
