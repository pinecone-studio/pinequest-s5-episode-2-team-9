import type { ModelDefinition, PartDef } from '../ModelDefinition'
import { heartTour } from './tour'

// Oxygen-poor side blue, oxygen-rich side red, valves gold, muscle violet.
const BLUE = '#5aa8ff'
const RED = '#ff5d6c'
const GOLD = '#ffd27a'
const VIOLET = '#b18cff'

/** A vessel attached to `to`, tinted by the blood it carries. */
function vessel(
  id: string,
  to: string,
  blood: 'rich' | 'poor',
  flow: 'in' | 'out',
  extra: Partial<PartDef> = {},
): PartDef {
  return { id, group: 'great_vessels', color: blood === 'rich' ? RED : BLUE, dependsOn: [to], blood, flow, ...extra }
}

export const heart: ModelDefinition = {
  id: 'heart',
  slug: 'heart',
  url: '/models/heart.glb',
  groups: ['chambers', 'valves', 'great_vessels', 'coronary', 'cardiac_veins'],
  baseParts: ['septum'],
  cutaway: true,
  edges: false,
  glow: 1,
  initialRotation: [0.1, -0.35, 0],
  tour: heartTour,
  connected: true,
  accent: RED,
  sources: [
    { text: 'Browne, K. (2024). 3D Reference Organ for Heart, Male, v1.3. HuBMAP.', url: 'https://doi.org/10.48539/HBM564.WKNG.249' },
    {
      text: 'Browne, K. & Schlehlein, H. (2024). 3D Reference Organ for Blood Vasculature, Male, v1.3. HuBMAP.',
      url: 'https://doi.org/10.48539/HBM473.XTPP.725',
    },
    { text: 'Creative Commons Attribution 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  ],
  motion: 'heart',
  looks: {
    default: 'myocardium',
    septum: 'septum',
    valves: 'valve',
    papillary_muscles: 'papillary',
    chordae_tendineae: 'valve',
    great_vessels: 'artery',
    pulmonary_trunk: 'vein',
    right_pulmonary_artery: 'vein',
    left_pulmonary_artery: 'vein',
    superior_vena_cava: 'vein',
    inferior_vena_cava: 'vein',
    coronary: 'coronaryArtery',
    cardiac_veins: 'coronaryVein',
  },
  // Each part attaches to the first part in dependsOn; scripts/build-heart.ts measures that opening.
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
      dependsOn: ['right_ventricle', 'left_ventricle'],
      explodeScale: 0.6,
    },
    { id: 'chordae_tendineae', group: 'valves', color: GOLD, dependsOn: ['papillary_muscles'], explodeScale: 0.7 },
    { id: 'tricuspid_valve', group: 'valves', color: GOLD, dependsOn: ['right_atrium', 'chordae_tendineae'] },
    { id: 'mitral_valve', group: 'valves', color: GOLD, dependsOn: ['left_atrium', 'chordae_tendineae'] },
    { id: 'pulmonary_valve', group: 'valves', color: GOLD, dependsOn: ['right_ventricle'] },
    { id: 'aortic_valve', group: 'valves', color: GOLD, dependsOn: ['left_ventricle'] },
    vessel('superior_vena_cava', 'right_atrium', 'poor', 'in', { hint: 'vena_cava' }),
    vessel('inferior_vena_cava', 'right_atrium', 'poor', 'in', { hint: 'vena_cava' }),
    vessel('pulmonary_trunk', 'pulmonary_valve', 'poor', 'out'),
    vessel('right_pulmonary_artery', 'pulmonary_trunk', 'poor', 'out', { hint: 'pulmonary_artery' }),
    vessel('left_pulmonary_artery', 'pulmonary_trunk', 'poor', 'out', { hint: 'pulmonary_artery' }),
    vessel('right_superior_pulmonary_vein', 'left_atrium', 'rich', 'in', { hint: 'pulmonary_vein', info: 'pulmonary_vein' }),
    vessel('right_inferior_pulmonary_vein', 'left_atrium', 'rich', 'in', { hint: 'pulmonary_vein', info: 'pulmonary_vein' }),
    vessel('left_superior_pulmonary_vein', 'left_atrium', 'rich', 'in', { hint: 'pulmonary_vein', info: 'pulmonary_vein' }),
    vessel('left_inferior_pulmonary_vein', 'left_atrium', 'rich', 'in', { hint: 'pulmonary_vein', info: 'pulmonary_vein' }),
    vessel('aorta', 'aortic_valve', 'rich', 'out', { explodeScale: 1.2 }),
    vessel('brachiocephalic_artery', 'aorta', 'rich', 'out', { hint: 'arch_branch' }),
    vessel('left_common_carotid_artery', 'aorta', 'rich', 'out', { hint: 'arch_branch' }),
    vessel('left_subclavian_artery', 'aorta', 'rich', 'out', { hint: 'arch_branch' }),
    vessel('left_main_coronary_artery', 'aortic_valve', 'rich', 'out', { group: 'coronary', hint: 'coronary_artery' }),
    vessel('left_anterior_descending_artery', 'left_main_coronary_artery', 'rich', 'out', { group: 'coronary' }),
    vessel('diagonal_branches', 'left_anterior_descending_artery', 'rich', 'out', { group: 'coronary' }),
    vessel('left_marginal_branch', 'diagonal_branches', 'rich', 'out', { group: 'coronary' }),
    vessel('right_coronary_artery', 'aortic_valve', 'rich', 'out', { group: 'coronary', hint: 'coronary_artery' }),
    vessel('right_marginal_artery', 'right_coronary_artery', 'rich', 'out', { group: 'coronary', hint: 'right_branch' }),
    vessel('posterior_descending_artery', 'right_coronary_artery', 'rich', 'out', { group: 'coronary', hint: 'right_branch' }),
    vessel('coronary_sinus', 'right_atrium', 'poor', 'in', { group: 'cardiac_veins' }),
    vessel('great_cardiac_vein', 'coronary_sinus', 'poor', 'in', { group: 'cardiac_veins', hint: 'cardiac_vein' }),
    vessel('middle_cardiac_vein', 'coronary_sinus', 'poor', 'in', { group: 'cardiac_veins', hint: 'cardiac_vein' }),
    vessel('small_cardiac_vein', 'coronary_sinus', 'poor', 'in', { group: 'cardiac_veins', hint: 'cardiac_vein' }),
    vessel('anterior_cardiac_veins', 'right_atrium', 'poor', 'in', { group: 'cardiac_veins' }),
  ],
}
