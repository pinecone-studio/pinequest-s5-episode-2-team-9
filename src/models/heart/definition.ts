import type { ModelDefinition } from '../ModelDefinition'

// Oxygen-poor side blue, oxygen-rich side red, valves gold, muscle violet.
const BLUE = '#5aa8ff'
const RED = '#ff5d6c'
const GOLD = '#ffd27a'
const VIOLET = '#b18cff'

export const heart: ModelDefinition = {
  id: 'heart',
  slug: 'heart',
  url: '/models/heart.glb',
  groups: ['chambers', 'valves', 'great_vessels', 'coronary'],
  baseParts: ['septum'],
  cutaway: true,
  edges: false,
  glow: 1,
  initialRotation: [0.1, -0.35, 0],
  accent: RED,
  parts: [
    { id: 'septum', group: 'chambers', color: VIOLET, dependsOn: [], explodeScale: 0.3 },
    { id: 'right_ventricle', group: 'chambers', color: BLUE, dependsOn: ['septum'], hint: 'ventricle' },
    { id: 'left_ventricle', group: 'chambers', color: RED, dependsOn: ['septum'], hint: 'ventricle' },
    { id: 'right_atrium', group: 'chambers', color: BLUE, dependsOn: ['right_ventricle'] },
    { id: 'left_atrium', group: 'chambers', color: RED, dependsOn: ['left_ventricle'] },
    {
      id: 'papillary_muscles',
      group: 'valves',
      color: VIOLET,
      dependsOn: ['left_ventricle', 'right_ventricle'],
      explodeScale: 0.6,
    },
    { id: 'tricuspid_valve', group: 'valves', color: GOLD, dependsOn: ['right_atrium', 'papillary_muscles'] },
    { id: 'mitral_valve', group: 'valves', color: GOLD, dependsOn: ['left_atrium', 'papillary_muscles'] },
    { id: 'pulmonary_valve', group: 'valves', color: GOLD, dependsOn: ['right_ventricle'] },
    { id: 'aortic_valve', group: 'valves', color: GOLD, dependsOn: ['left_ventricle'] },
    { id: 'pulmonary_trunk', group: 'great_vessels', color: BLUE, dependsOn: ['pulmonary_valve'] },
    { id: 'aorta', group: 'great_vessels', color: RED, dependsOn: ['aortic_valve'], explodeScale: 1.2 },
    { id: 'pulmonary_veins', group: 'great_vessels', color: RED, dependsOn: ['left_atrium'] },
    { id: 'superior_vena_cava', group: 'great_vessels', color: BLUE, dependsOn: ['right_atrium'], hint: 'vena_cava' },
    { id: 'inferior_vena_cava', group: 'great_vessels', color: BLUE, dependsOn: ['right_atrium'], hint: 'vena_cava' },
    { id: 'left_coronary_artery', group: 'coronary', color: RED, dependsOn: ['aorta'], hint: 'coronary_artery' },
    { id: 'right_coronary_artery', group: 'coronary', color: RED, dependsOn: ['aorta'], hint: 'coronary_artery' },
    {
      id: 'cardiac_veins',
      group: 'coronary',
      color: BLUE,
      dependsOn: ['left_coronary_artery', 'right_coronary_artery', 'right_atrium'],
    },
  ],
}
