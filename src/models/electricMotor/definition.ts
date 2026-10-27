import type { ModelDefinition } from '../ModelDefinition'

const COPPER = '#ffa95e'
const STEEL = '#cfe9ff'
const IRON = '#8fb8d8'
const NORTH = '#ff5d6c'
const SOUTH = '#5aa8ff'
const CARBON = '#b7a6ff'

export const electricMotor: ModelDefinition = {
  id: 'electricMotor',
  slug: 'electric-motor',
  url: '/models/electric-motor.glb',
  groups: ['stator', 'rotor', 'contacts', 'frame'],
  baseParts: ['housing'],
  cutaway: true,
  edges: true,
  glow: 0.42,
  initialRotation: [0.35, -0.7, 0],
  accent: COPPER,
  sources: [],
  looks: {
    default: 'steel',
    north_magnet: 'magnetNorth',
    south_magnet: 'magnetSouth',
    armature_core: 'ironLamination',
    windings: 'copper',
    commutator: 'copper',
    brushes: 'carbon',
    front_end_cap: 'aluminium',
    rear_end_cap: 'aluminium',
    fan: 'plasticBlack',
    terminals: 'gold',
  },
  parts: [
    { id: 'housing', group: 'stator', color: STEEL, dependsOn: [], explodeScale: 0.2 },
    { id: 'north_magnet', group: 'stator', color: NORTH, dependsOn: ['housing'], explodeDir: [0, 1, 0] },
    { id: 'south_magnet', group: 'stator', color: SOUTH, dependsOn: ['housing'], explodeDir: [0, -1, 0] },
    { id: 'shaft', group: 'rotor', color: STEEL, dependsOn: ['housing'], explodeDir: [0, 0, 1], explodeScale: 3 },
    { id: 'armature_core', group: 'rotor', color: IRON, dependsOn: ['shaft'], explodeDir: [0, 0.3, 1], explodeScale: 3.6 },
    { id: 'windings', group: 'rotor', color: COPPER, dependsOn: ['armature_core'], explodeDir: [-0.2, 0.5, 1], explodeScale: 4.6 },
    { id: 'commutator', group: 'contacts', color: COPPER, dependsOn: ['shaft'], explodeDir: [0.6, 0, 1] },
    { id: 'front_bearing', group: 'frame', color: STEEL, dependsOn: ['shaft'], explodeDir: [-1, 0, 0.4] },
    { id: 'rear_bearing', group: 'frame', color: STEEL, dependsOn: ['shaft'], explodeDir: [1, 0, 0.4] },
    {
      id: 'front_end_cap',
      group: 'frame',
      color: STEEL,
      dependsOn: ['front_bearing', 'north_magnet', 'south_magnet', 'windings'],
      explodeDir: [-1, 0, 0],
    },
    {
      id: 'rear_end_cap',
      group: 'frame',
      color: STEEL,
      dependsOn: ['rear_bearing', 'commutator', 'north_magnet', 'south_magnet', 'windings'],
      explodeDir: [1, 0, 0],
    },
    { id: 'brushes', group: 'contacts', color: CARBON, dependsOn: ['rear_end_cap'], explodeDir: [0.5, 1, 0] },
    { id: 'terminals', group: 'contacts', color: COPPER, dependsOn: ['brushes'], explodeDir: [1, 0.2, 0.6] },
    { id: 'fan', group: 'frame', color: STEEL, dependsOn: ['front_end_cap'], explodeDir: [-1, 0, 0] },
  ],
}
