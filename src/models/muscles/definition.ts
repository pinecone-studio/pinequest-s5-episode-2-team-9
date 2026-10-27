import type { ModelDefinition, PartDef } from '../ModelDefinition'

const BONE = '#3f5266'
const TRUNK = '#ff6b7f'
const DEEP = '#ffb44d'
const ARM = '#ff8fb1'
const LEG = '#ff5d6c'

const limbs: PartDef[] = (['left', 'right'] as const).flatMap((s) => {
  const p = (id: string, group: string, color: string, dependsOn: string[]): PartDef => ({
    id: `${id}_${s}`,
    group,
    color,
    dependsOn,
    info: id,
    hint: id,
  })
  return [
    p('rotator_cuff', 'arm', DEEP, ['skeleton_base']),
    p('pectoral', 'trunk', TRUNK, ['intercostals']),
    p('deltoid', 'arm', ARM, [`rotator_cuff_${s}`]),
    p('biceps_brachii', 'arm', ARM, [`rotator_cuff_${s}`]),
    p('triceps', 'arm', ARM, [`rotator_cuff_${s}`]),
    p('forearm_flexors', 'arm', ARM, [`biceps_brachii_${s}`]),
    p('forearm_extensors', 'arm', ARM, [`triceps_${s}`]),
    p('hip_flexors', 'leg', DEEP, ['skeleton_base']),
    p('gluteals', 'leg', LEG, ['pelvic_floor']),
    p('adductors', 'leg', LEG, [`hip_flexors_${s}`]),
    p('quadriceps', 'leg', LEG, [`hip_flexors_${s}`]),
    p('hamstrings', 'leg', LEG, [`gluteals_${s}`]),
    p('calf', 'leg', LEG, [`hamstrings_${s}`]),
    p('shin', 'leg', LEG, [`quadriceps_${s}`]),
  ]
})

export const muscles: ModelDefinition = {
  id: 'muscles',
  slug: 'muscles',
  url: '/models/muscles.glb',
  groups: ['skeleton', 'trunk', 'arm', 'leg'],
  baseParts: ['skeleton_base'],
  cutaway: false,
  edges: false,
  glow: 0.6,
  initialRotation: [0.05, -0.45, 0],
  accent: TRUNK,
  sources: [
    {
      text: 'BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International',
      url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
    },
  ],
  looks: {
    default: 'muscle',
    skeleton_base: 'boneFaint',
    intercostals: 'muscleDeep',
    diaphragm: 'muscleDeep',
    back_muscles: 'muscleDeep',
    pelvic_floor: 'muscleDeep',
    rotator_cuff: 'muscleDeep',
    hip_flexors: 'muscleDeep',
  },
  parts: [
    { id: 'skeleton_base', group: 'skeleton', color: BONE, dependsOn: [], explodeScale: 0 },
    { id: 'intercostals', group: 'trunk', color: DEEP, dependsOn: ['skeleton_base'] },
    { id: 'diaphragm', group: 'trunk', color: DEEP, dependsOn: ['skeleton_base'] },
    { id: 'back_muscles', group: 'trunk', color: DEEP, dependsOn: ['skeleton_base'] },
    { id: 'pelvic_floor', group: 'trunk', color: DEEP, dependsOn: ['skeleton_base'] },
    { id: 'neck_muscles', group: 'trunk', color: TRUNK, dependsOn: ['skeleton_base'] },
    { id: 'rhomboids', group: 'trunk', color: TRUNK, dependsOn: ['back_muscles'] },
    { id: 'trapezius', group: 'trunk', color: TRUNK, dependsOn: ['rhomboids', 'neck_muscles'] },
    { id: 'abdominal_wall', group: 'trunk', color: TRUNK, dependsOn: ['intercostals'] },
    ...limbs,
    { id: 'hand_muscles', group: 'arm', color: ARM, dependsOn: ['forearm_flexors_left', 'forearm_flexors_right'] },
    { id: 'foot_muscles', group: 'leg', color: LEG, dependsOn: ['calf_left', 'calf_right', 'shin_left', 'shin_right'] },
  ],
}
