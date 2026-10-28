// The whole circulation as a network of vessels, in the heart model's raw units.
// Points inside the heart follow centre lines measured from the HuBMAP meshes
// (scripts/vessel-centerlines.ts); the lungs and the body are drawn around it so the
// full double loop is visible:
//   body → venae cavae → right atrium → right ventricle → pulmonary artery → lungs
//   → pulmonary veins → left atrium → left ventricle → aorta → body (and the heart's
//   own coronary arteries → coronary sinus → right atrium).
// Axes: +x is the patient's left, +y up, +z towards the front.
import type { SegmentDef, V3 } from './circuit'

/** Oxygen-poor blood (really dark red; blue by convention). */
export const BLUE = '#3f7dff'
/** Oxygen-rich blood. */
export const RED = '#ff2d48'

// Junctions inside the heart.
const RA: V3 = [-0.04, 0.002, 0.001]
const TRICUSPID: V3 = [-0.024, -0.016, 0.008]
const PULMONARY_VALVE: V3 = [-0.003, 0.031, 0.002]
const BIFURCATION: V3 = [-0.005, 0.0508, -0.016]
const LA: V3 = [-0.007, 0.021, -0.033]
const MITRAL: V3 = [0.004, 0.001, -0.026]
const AORTIC_VALVE: V3 = [-0.012, 0.023, -0.009]
const ROOT: V3 = [-0.021, 0.031, -0.012]
const ARCH: V3 = [-0.0105, 0.0865, -0.028]
const CORONARY_SINUS: V3 = [-0.0166, -0.0218, -0.023]

// Vessel ends where blood leaves or enters the heart model.
const RPA_END: V3 = [-0.042, 0.0486, -0.038]
const LPA_END: V3 = [0.0305, 0.0427, -0.064]
const RPV1: V3 = [-0.05, 0.0174, -0.0524]
const RPV2: V3 = [-0.0567, 0.0139, -0.0354]
const LPV1: V3 = [0.0215, 0.0156, -0.055]
const LPV2: V3 = [0.0244, 0.0524, -0.0308]
const HEAD_IN1: V3 = [-0.03, 0.118, -0.012]
const HEAD_IN2: V3 = [0.0, 0.12, -0.03]
const SVC_IN: V3 = [-0.042, 0.105, -0.012]
const LEGS_IN: V3 = [-0.004, -0.078, -0.068]
const IVC_IN: V3 = [-0.036, -0.09, -0.05]

/** Organs drawn around the heart (raw units). */
export const LUNGS = {
  right: { center: [-0.108, 0.04, -0.038] as V3, radii: [0.036, 0.07, 0.042] as V3 },
  left: { center: [0.1, 0.04, -0.048] as V3, radii: [0.033, 0.068, 0.04] as V3 },
  trachea: [
    [-0.004, 0.19, -0.056],
    [-0.004, 0.12, -0.058],
  ] as V3[],
  bronchi: {
    right: [[-0.004, 0.12, -0.058], [-0.05, 0.1, -0.05], [-0.095, 0.075, -0.04]] as V3[],
    left: [[-0.004, 0.12, -0.058], [0.045, 0.1, -0.056], [0.088, 0.075, -0.048]] as V3[],
  },
}
export const BODY = {
  upper: [-0.02, 0.15, -0.018] as V3,
  lower: [-0.008, -0.115, -0.055] as V3,
}

const CAP = 0.0012

export type Region =
  | 'venaCava'
  | 'rightAtrium'
  | 'rightVentricle'
  | 'pulmonaryArtery'
  | 'lungs'
  | 'pulmonaryVeins'
  | 'leftAtrium'
  | 'leftVentricle'
  | 'aorta'
  | 'upperBody'
  | 'lowerBody'
  | 'coronary'

type HeartSegment = SegmentDef & { region: Region }

export const HEART_SEGMENTS: HeartSegment[] = [
  // ---- Right heart ----
  {
    id: 'svc',
    region: 'venaCava',
    points: [SVC_IN, [-0.0406, 0.0875, -0.0124], [-0.043, 0.0708, -0.018], [-0.0472, 0.0457, -0.0153], [-0.0465, 0.0308, -0.0185], [-0.046, 0.016, -0.01], RA],
    radius: [0.007, 0.008, 0.009, 0.009, 0.008, 0.009, 0.012],
    color: BLUE,
    next: [{ id: 'ra' }],
  },
  {
    id: 'ivc',
    region: 'venaCava',
    points: [IVC_IN, [-0.0354, -0.0591, -0.0475], [-0.0368, -0.0532, -0.0409], [-0.0361, -0.0367, -0.0283], [-0.0408, -0.0314, -0.0275], [-0.045, -0.015, -0.012], RA],
    radius: [0.008, 0.008, 0.009, 0.01, 0.01, 0.01, 0.012],
    color: BLUE,
    next: [{ id: 'ra' }],
  },
  {
    id: 'cs',
    region: 'coronary',
    points: [CORONARY_SINUS, [-0.03, -0.012, -0.012], RA],
    radius: [0.003, 0.004, 0.008],
    color: BLUE,
    next: [{ id: 'ra' }],
  },
  {
    id: 'ra',
    region: 'rightAtrium',
    points: [RA, [-0.036, -0.006, 0.006], TRICUSPID],
    radius: [0.014, 0.012, 0.007],
    color: BLUE,
    pool: true,
    next: [{ id: 'rv' }],
  },
  {
    id: 'rv',
    region: 'rightVentricle',
    gate: 'av',
    points: [TRICUSPID, [-0.004, -0.028, 0.026], [0.016, -0.036, 0.034], [0.008, -0.01, 0.03], [0.0, 0.016, 0.016], PULMONARY_VALVE],
    radius: [0.007, 0.012, 0.01, 0.012, 0.009, 0.006],
    color: BLUE,
    pool: true,
    next: [{ id: 'pt' }],
  },
  {
    id: 'pt',
    region: 'pulmonaryArtery',
    gate: 'sl',
    points: [PULMONARY_VALVE, [-0.006, 0.0367, -0.0064], [-0.0053, 0.0434, -0.0089], BIFURCATION],
    radius: [0.006, 0.008, 0.009, 0.009],
    color: BLUE,
    next: [{ id: 'rpa' }, { id: 'lpa' }],
  },
  {
    id: 'rpa',
    region: 'pulmonaryArtery',
    points: [BIFURCATION, [-0.0185, 0.0479, -0.0285], [-0.033, 0.047, -0.031], RPA_END],
    radius: [0.008, 0.007, 0.006, 0.005],
    color: BLUE,
    next: [{ id: 'rcap_a' }, { id: 'rcap_b' }, { id: 'rcap_c' }],
  },
  {
    id: 'lpa',
    region: 'pulmonaryArtery',
    points: [BIFURCATION, [0.008, 0.054, -0.028], [0.0235, 0.05, -0.048], LPA_END],
    radius: [0.008, 0.007, 0.006, 0.005],
    color: BLUE,
    next: [{ id: 'lcap_a' }, { id: 'lcap_b' }, { id: 'lcap_c' }],
  },

  // ---- Lungs: blue turns red (CO2 out, O2 in) ----
  lung('rcap_a', [RPA_END, [-0.075, 0.075, -0.04], [-0.112, 0.095, -0.032], [-0.13, 0.06, -0.036], [-0.1, 0.035, -0.05], RPV1], 'rpv1'),
  lung('rcap_b', [RPA_END, [-0.072, 0.05, -0.028], [-0.112, 0.03, -0.022], [-0.128, 0.0, -0.036], [-0.09, -0.004, -0.045], RPV2], 'rpv2'),
  lung('rcap_c', [RPA_END, [-0.08, 0.06, -0.05], [-0.115, 0.05, -0.058], [-0.11, 0.015, -0.055], [-0.075, 0.018, -0.054], RPV1], 'rpv1'),
  lung('lcap_a', [LPA_END, [0.065, 0.065, -0.06], [0.1, 0.09, -0.05], [0.12, 0.06, -0.045], [0.09, 0.05, -0.035], LPV2], 'lpv2'),
  lung('lcap_b', [LPA_END, [0.065, 0.035, -0.065], [0.105, 0.02, -0.06], [0.118, -0.005, -0.05], [0.07, 0.0, -0.055], LPV1], 'lpv1'),
  lung('lcap_c', [LPA_END, [0.07, 0.05, -0.052], [0.11, 0.04, -0.04], [0.1, 0.015, -0.032], [0.055, 0.02, -0.05], LPV1], 'lpv1'),

  // ---- Left heart ----
  vein('rpv1', [RPV1, [-0.0426, 0.0143, -0.0506], [-0.0325, 0.0121, -0.0493], LA]),
  vein('rpv2', [RPV2, [-0.0511, 0.0209, -0.0327], [-0.0435, 0.0258, -0.0309], LA]),
  vein('lpv1', [LPV1, [0.0137, 0.0183, -0.0532], [0.0032, 0.0171, -0.0516], LA]),
  vein('lpv2', [LPV2, [0.0206, 0.0486, -0.0298], [0.0172, 0.0406, -0.0327], LA]),
  {
    id: 'la',
    region: 'leftAtrium',
    points: [LA, [-0.003, 0.012, -0.03], MITRAL],
    radius: [0.013, 0.011, 0.007],
    color: RED,
    pool: true,
    next: [{ id: 'lv' }],
  },
  {
    id: 'lv',
    region: 'leftVentricle',
    gate: 'av',
    points: [MITRAL, [0.02, -0.012, -0.008], [0.042, -0.03, 0.026], [0.024, -0.006, 0.01], [0.004, 0.014, -0.004], AORTIC_VALVE],
    radius: [0.007, 0.012, 0.009, 0.012, 0.009, 0.006],
    color: RED,
    pool: true,
    next: [{ id: 'root' }],
  },
  {
    id: 'root',
    region: 'aorta',
    gate: 'sl',
    points: [AORTIC_VALVE, [-0.017, 0.027, -0.011], ROOT],
    radius: [0.006, 0.009, 0.01],
    color: RED,
    next: [{ id: 'asc', weight: 0.94 }, { id: 'lca', weight: 0.03 }, { id: 'rca', weight: 0.03 }],
  },
  {
    id: 'asc',
    region: 'aorta',
    points: [ROOT, [-0.0214, 0.0445, -0.0097], [-0.0222, 0.0572, -0.0102], [-0.0189, 0.0683, -0.0133], [-0.015, 0.0776, -0.0202], ARCH],
    radius: [0.01, 0.011, 0.011, 0.011, 0.012, 0.012],
    color: RED,
    next: [{ id: 'head1', weight: 0.2 }, { id: 'head2', weight: 0.15 }, { id: 'desc', weight: 0.65 }],
  },
  {
    id: 'head1',
    region: 'aorta',
    points: [ARCH, [-0.02, 0.095, -0.02], [-0.026, 0.101, -0.014], HEAD_IN1],
    radius: [0.006, 0.004, 0.003, 0.003],
    color: RED,
    next: [{ id: 'ub_a' }, { id: 'ub_c' }],
  },
  {
    id: 'head2',
    region: 'aorta',
    points: [ARCH, [-0.003, 0.096, -0.033], [-0.0014, 0.106, -0.033], HEAD_IN2],
    radius: [0.006, 0.004, 0.003, 0.003],
    color: RED,
    next: [{ id: 'ub_b' }],
  },
  {
    id: 'desc',
    region: 'aorta',
    points: [
      ARCH,
      [-0.004, 0.084, -0.045],
      [-0.005, 0.072, -0.056],
      [-0.0051, 0.0575, -0.0608],
      [-0.0072, 0.0428, -0.066],
      [-0.0071, 0.017, -0.0685],
      [-0.0056, -0.0071, -0.0686],
      [-0.0044, -0.028, -0.0697],
      [-0.004, -0.055, -0.07],
      LEGS_IN,
    ],
    radius: [0.01, 0.009, 0.009, 0.008, 0.008, 0.008, 0.008, 0.008, 0.006, 0.005],
    color: RED,
    next: [{ id: 'lb_a' }, { id: 'lb_b' }, { id: 'lb_c' }],
  },

  // ---- Body: red turns blue (O2 delivered to the cells) ----
  body('ub_a', 'upperBody', [HEAD_IN1, [-0.055, 0.132, -0.02], [-0.075, 0.15, -0.015], [-0.062, 0.162, -0.01], [-0.047, 0.135, -0.01], SVC_IN], 'svc'),
  body('ub_b', 'upperBody', [HEAD_IN2, [0.022, 0.138, -0.03], [0.004, 0.162, -0.025], [-0.028, 0.168, -0.02], [-0.045, 0.13, -0.015], SVC_IN], 'svc'),
  body('ub_c', 'upperBody', [HEAD_IN1, [-0.02, 0.145, -0.015], [-0.034, 0.157, -0.01], [-0.05, 0.142, -0.012], SVC_IN], 'svc'),
  body('lb_a', 'lowerBody', [LEGS_IN, [0.02, -0.095, -0.06], [0.036, -0.116, -0.05], [0.01, -0.132, -0.045], [-0.03, -0.12, -0.045], IVC_IN], 'ivc'),
  body('lb_b', 'lowerBody', [LEGS_IN, [-0.02, -0.1, -0.072], [-0.05, -0.116, -0.062], [-0.062, -0.1, -0.05], IVC_IN], 'ivc'),
  body('lb_c', 'lowerBody', [LEGS_IN, [0.0, -0.11, -0.066], [-0.015, -0.132, -0.056], [-0.04, -0.112, -0.05], IVC_IN], 'ivc'),

  // ---- The heart's own supply: coronary arteries → heart muscle → coronary sinus ----
  {
    id: 'lca',
    region: 'coronary',
    points: [ROOT, [-0.0047, 0.0305, -0.0121], [0.0113, 0.0201, -0.0187], [0.0214, 0.0144, -0.0256], [0.022, 0.0039, -0.0345], [0.0179, -0.008, -0.0417], [0.004, -0.021, -0.03], CORONARY_SINUS],
    radius: 0.0025,
    color: [RED, BLUE],
    next: [{ id: 'cs' }],
  },
  {
    id: 'rca',
    region: 'coronary',
    points: [ROOT, [-0.0192, 0.0221, 0.0075], [-0.0289, 0.0132, 0.0204], [-0.0397, 0, 0.0267], [-0.0444, -0.0165, 0.0282], [-0.0443, -0.0309, 0.0257], [-0.0349, -0.0416, 0.0139], [-0.0223, -0.0401, 0.0023], [-0.01, -0.032, -0.0078], CORONARY_SINUS],
    radius: 0.0025,
    color: [RED, BLUE],
    next: [{ id: 'cs' }],
  },
]

function lung(id: string, points: V3[], vein: string): HeartSegment {
  return { id, region: 'lungs', points, radius: CAP, color: [BLUE, RED], next: [{ id: vein }] }
}

function vein(id: string, points: V3[]): HeartSegment {
  return { id, region: 'pulmonaryVeins', points, radius: [0.004, 0.004, 0.005, 0.01], color: RED, next: [{ id: 'la' }] }
}

function body(id: string, region: Region, points: V3[], vein: string): HeartSegment {
  return { id, region, points, radius: CAP, color: [RED, BLUE], next: [{ id: vein }] }
}

/** Segments outside the heart model, drawn as faint vessel tubes. */
export const OUTSIDE = new Set(['rcap_a', 'rcap_b', 'rcap_c', 'lcap_a', 'lcap_b', 'lcap_c', 'ub_a', 'ub_b', 'ub_c', 'lb_a', 'lb_b', 'lb_c'])

/** One full lap for the tracer: body → lungs → body, once through each half of the body. */
export const TRACER_ROUTE = [
  'ivc', 'ra', 'rv', 'pt', 'rpa', 'rcap_a', 'rpv1', 'la', 'lv', 'root', 'asc', 'head1', 'ub_a',
  'svc', 'ra', 'rv', 'pt', 'lpa', 'lcap_b', 'lpv1', 'la', 'lv', 'root', 'asc', 'desc', 'lb_a',
]

export const REGION_OF = new Map(HEART_SEGMENTS.map((s) => [s.id, s.region]))
