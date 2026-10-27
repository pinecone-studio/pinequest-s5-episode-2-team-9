import type { ModelDefinition, PartDef } from '../ModelDefinition'

// Realistic-only model: the parts are shown with physically based materials.
const ACCENT = '#5ee7ff'
const TINT = '#8fd6ff'

const part = (id: string, group: string, dependsOn: string[], extra: Partial<PartDef> = {}): PartDef => ({
  id,
  group,
  color: TINT,
  dependsOn,
  ...extra,
})

/** Lifts a part straight out through the glass side when the model comes apart. */
const OUT = (explodeScale: number): Partial<PartDef> => ({ explodeDir: [0, 0, 1], explodeScale })

export const computer: ModelDefinition = {
  id: 'computer',
  slug: 'computer',
  url: '/models/computer.glb',
  groups: ['chassis', 'power', 'board', 'processor', 'memory', 'graphics', 'storage', 'airflow'],
  baseParts: ['case_frame'],
  cutaway: false,
  edges: false,
  glow: 0.5,
  initialRotation: [0.15, -0.5, 0],
  accent: ACCENT,
  realisticOnly: true,
  sources: [
    {
      text: 'Original model by Hologemma, built from standard ATX, PCIe and DIMM form-factor dimensions. Not a copy of any product.',
      url: 'https://en.wikipedia.org/wiki/ATX',
    },
  ],
  looks: {
    default: 'chassisSteel',
    side_panel: 'glass',
    psu: 'darkMetal',
    psu_cables: 'rubber',
    motherboard: 'pcb',
    io_shield: 'aluminium',
    vrm_heatsink: 'aluminium',
    chipset_heatsink: 'aluminium',
    cpu_socket: 'plasticBlack',
    cpu: 'nickel',
    cpu_cooler: 'aluminium',
    cpu_fan: 'plasticBlack',
    ram: 'dimmBlack',
    m2_ssd: 'darkMetal',
    gpu: 'plasticBlack',
    sata_ssd: 'darkMetal',
    hdd: 'aluminium',
    case_fan: 'plasticBlack',
  },
  parts: [
    part('case_frame', 'chassis', [], { explodeScale: 0.3 }),
    part('psu', 'power', ['case_frame'], { explodeDir: [-0.3, -1, 0.6], explodeScale: 1.4 }),
    part('psu_cables', 'power', ['psu', 'motherboard', 'hdd', 'sata_ssd'], { explodeDir: [0, 0, 1], explodeScale: 1.2 }),
    part('motherboard', 'board', ['case_frame'], OUT(1.4)),
    part('io_shield', 'board', ['motherboard'], { explodeDir: [-1, 0, 0], explodeScale: 1.4 }),
    part('vrm_heatsink', 'board', ['motherboard'], OUT(2)),
    part('chipset_heatsink', 'board', ['motherboard'], OUT(2)),
    part('cpu_socket', 'processor', ['motherboard'], OUT(2)),
    part('cpu', 'processor', ['cpu_socket'], OUT(2.6)),
    part('cpu_cooler', 'processor', ['cpu'], OUT(3.2)),
    part('cpu_fan', 'processor', ['cpu_cooler'], { explodeDir: [0.6, 0, 1], explodeScale: 3.4 }),
    part('ram_1', 'memory', ['motherboard'], { info: 'ram', hint: 'ram', ...OUT(2.4) }),
    part('ram_2', 'memory', ['motherboard'], { info: 'ram', hint: 'ram', ...OUT(2.4) }),
    part('m2_ssd', 'storage', ['motherboard'], OUT(2.2)),
    part('gpu', 'graphics', ['motherboard', 'psu_cables'], { explodeDir: [0, -0.3, 1], explodeScale: 2.2 }),
    part('sata_ssd', 'storage', ['case_frame'], { explodeDir: [1, -0.2, 0.6], explodeScale: 1.6 }),
    part('hdd', 'storage', ['case_frame'], { explodeDir: [1, -0.6, 0.4], explodeScale: 1.6 }),
    part('front_fan', 'airflow', ['case_frame'], { info: 'case_fan', hint: 'case_fan', explodeDir: [1, 0, 0], explodeScale: 1.6 }),
    part('rear_fan', 'airflow', ['case_frame'], { info: 'case_fan', hint: 'case_fan', explodeDir: [-1, 0, 0], explodeScale: 1.6 }),
    part('side_panel', 'chassis', [
      'io_shield',
      'vrm_heatsink',
      'chipset_heatsink',
      'cpu_fan',
      'ram_1',
      'ram_2',
      'm2_ssd',
      'gpu',
      'sata_ssd',
      'hdd',
      'front_fan',
      'rear_fan',
      'psu_cables',
    ], { explodeDir: [0, 0, 1], explodeScale: 2.6 }),
  ],
}
