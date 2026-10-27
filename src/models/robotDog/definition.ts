import type { ModelDefinition, PartDef } from '../ModelDefinition'

const CYAN = '#5ee7ff'
const TEAL = '#4dffc3'
const AMBER = '#ffb44d'
const VIOLET = '#a78bff'
const ICE = '#cfe9ff'

const LEGS = ['lf', 'rf', 'lb', 'rb'] as const

const legParts: PartDef[] = LEGS.flatMap((leg) => [
  { id: `servos_${leg}`, group: 'motors', color: AMBER, dependsOn: ['controller_board'], info: 'servos', hint: 'servos' },
  { id: `hip_${leg}`, group: 'legs', color: CYAN, dependsOn: [`servos_${leg}`], info: 'hip', hint: 'hip' },
  { id: `upper_leg_${leg}`, group: 'legs', color: VIOLET, dependsOn: [`hip_${leg}`], info: 'upper_leg', hint: 'upper_leg' },
  { id: `lower_leg_${leg}`, group: 'legs', color: CYAN, dependsOn: [`upper_leg_${leg}`], info: 'lower_leg', hint: 'lower_leg' },
])

export const robotDog: ModelDefinition = {
  id: 'robotDog',
  slug: 'robot-dog',
  url: '/models/robot-dog.glb',
  groups: ['body', 'motors', 'legs'],
  baseParts: ['frame'],
  cutaway: false,
  edges: true,
  glow: 0.42,
  initialRotation: [0.35, -0.55, 0],
  accent: CYAN,
  sources: [
    { text: 'mangdangroboticsclub/mini_pupper_ros', url: 'https://github.com/mangdangroboticsclub/mini_pupper_ros' },
    { text: 'Apache License 2.0', url: '/licenses/mini-pupper-apache-2.0.txt' },
    { text: 'NOTICE', url: '/licenses/mini-pupper-NOTICE.txt' },
  ],
  looks: {
    default: 'plasticGrey',
    frame: 'plasticBlack',
    battery: 'battery',
    controller_board: 'pcb',
    lidar: 'plasticBlack',
    front_plate: 'plasticWhite',
    side_shells: 'plasticWhite',
    servos: 'servo',
    upper_leg: 'aluminium',
    lower_leg: 'plasticBlack',
  },
  parts: [
    { id: 'frame', group: 'body', color: CYAN, dependsOn: [], explodeScale: 0.2 },
    { id: 'battery', group: 'body', color: AMBER, dependsOn: ['frame'], explodeDir: [0, -1, 0] },
    { id: 'controller_board', group: 'body', color: TEAL, dependsOn: ['battery'], explodeDir: [0, 1, 0] },
    ...legParts,
    { id: 'lidar', group: 'body', color: VIOLET, dependsOn: ['controller_board'], explodeDir: [-0.4, 1, 0] },
    { id: 'front_plate', group: 'body', color: ICE, dependsOn: ['controller_board', 'lidar'], explodeDir: [1, 0.2, 0] },
    {
      id: 'side_shells',
      group: 'body',
      color: ICE,
      dependsOn: ['battery', 'controller_board', 'servos_lf', 'servos_rf', 'servos_lb', 'servos_rb'],
      explodeDir: [0, 0.6, 1],
    },
  ],
}
