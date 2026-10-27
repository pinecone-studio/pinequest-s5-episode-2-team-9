import type { ModelDefinition } from '../ModelDefinition'
import { rocketEngineTour } from './tour'

const HOT = '#ff8a4c'
const COPPER = '#ffb36b'
const LOX = '#6cc8ff'
const FUEL = '#ffd166'
const STEEL = '#cfe9ff'
const ELECTRIC = '#a78bff'

export const rocketEngine: ModelDefinition = {
  id: 'rocketEngine',
  slug: 'rocket-engine',
  url: '/models/rocket-engine.glb',
  groups: ['thrust', 'turbopump', 'plumbing', 'structure'],
  baseParts: ['combustion_chamber'],
  cutaway: true,
  edges: false,
  glow: 0.85,
  initialRotation: [0.2, 0.6, 0],
  tour: rocketEngineTour,
  accent: HOT,
  sources: [],
  motion: 'rocket',
  looks: {
    default: 'steel',
    combustion_chamber: 'hotCopper',
    nozzle: 'niobium',
    cooling_jacket: 'copper',
    gimbal: 'darkMetal',
    actuators: 'aluminium',
    fuel_pump: 'aluminium',
    lox_pump: 'oxygenLine',
    oxidizer_lines: 'oxygenLine',
    gas_generator: 'hotCopper',
    turbine_exhaust: 'darkMetal',
    main_oxidizer_valve: 'gold',
    main_fuel_valve: 'gold',
    controller: 'plasticBlack',
  },
  parts: [
    { id: 'combustion_chamber', group: 'thrust', color: HOT, dependsOn: [], explodeScale: 0.2 },
    { id: 'injector', group: 'thrust', color: COPPER, dependsOn: ['combustion_chamber'], explodeDir: [0, 1, 0] },
    { id: 'nozzle', group: 'thrust', color: HOT, dependsOn: ['combustion_chamber'], explodeDir: [0, -1, 0] },
    { id: 'cooling_jacket', group: 'thrust', color: FUEL, dependsOn: ['nozzle'], explodeDir: [1, -0.3, 0.4] },
    { id: 'igniter', group: 'thrust', color: ELECTRIC, dependsOn: ['injector'], explodeDir: [0.3, 1, 0.6] },
    { id: 'gimbal', group: 'structure', color: STEEL, dependsOn: ['injector'], explodeDir: [0, 1, 0] },
    { id: 'thrust_frame', group: 'structure', color: STEEL, dependsOn: ['gimbal'], explodeDir: [0, 1, 0] },
    { id: 'actuators', group: 'structure', color: STEEL, dependsOn: ['thrust_frame'], explodeDir: [1, 0.4, 1] },
    { id: 'turbine', group: 'turbopump', color: HOT, dependsOn: ['combustion_chamber'], explodeDir: [-1, 0, 0] },
    { id: 'fuel_pump', group: 'turbopump', color: FUEL, dependsOn: ['turbine'], explodeDir: [-1, 0.2, -0.4] },
    { id: 'lox_pump', group: 'turbopump', color: LOX, dependsOn: ['fuel_pump'], explodeDir: [-1, 0.6, 0] },
    { id: 'gas_generator', group: 'turbopump', color: HOT, dependsOn: ['turbine'], explodeDir: [-0.6, -0.4, 1] },
    { id: 'turbine_exhaust', group: 'turbopump', color: STEEL, dependsOn: ['turbine'], explodeDir: [-1, -0.6, 0] },
    { id: 'oxidizer_lines', group: 'plumbing', color: LOX, dependsOn: ['lox_pump', 'injector'], explodeDir: [-0.4, 1, 0.5] },
    { id: 'main_oxidizer_valve', group: 'plumbing', color: LOX, dependsOn: ['oxidizer_lines'], explodeDir: [0, 1, 1] },
    { id: 'fuel_lines', group: 'plumbing', color: FUEL, dependsOn: ['fuel_pump', 'cooling_jacket'], explodeDir: [-0.3, 0, 1] },
    { id: 'main_fuel_valve', group: 'plumbing', color: FUEL, dependsOn: ['fuel_lines'], explodeDir: [-0.2, 0, 1] },
    { id: 'controller', group: 'structure', color: ELECTRIC, dependsOn: ['thrust_frame'], explodeDir: [0.6, 1, -0.6] },
  ],
}
