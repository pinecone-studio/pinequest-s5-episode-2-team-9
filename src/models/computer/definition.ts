import type { ModelDefinition, PartDef } from '../ModelDefinition'
import { computerTour } from './tour'

// Realistic-only model: the parts are shown with physically based materials.
const ACCENT = '#5ee7ff'
const TINT = '#8fd6ff'
const POWER_TINT = '#ffb347'
const DATA_TINT = '#5ee7ff'

const part = (id: string, group: string, dependsOn: string[], extra: Partial<PartDef> = {}): PartDef => ({
  id,
  group,
  color: TINT,
  dependsOn,
  ...extra,
})

/** A cable: plugs into `to`, comes from `from`, and carries power or data in the direction of `flow`. */
const cable = (
  id: string,
  to: string,
  from: string,
  signal: 'power' | 'data',
  flow: 'in' | 'out',
  extra: Partial<PartDef> = {},
): PartDef => ({
  id,
  group: 'cabling',
  color: signal === 'power' ? POWER_TINT : DATA_TINT,
  dependsOn: [to, from],
  signal,
  flow,
  explodeDir: [0, 0, 1],
  explodeScale: 1.2,
  ...extra,
})

/** The glass goes on last, once everything inside is fitted and plugged in. */
const SIDE_PANEL_LAST = [
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
  'atx_cable',
  'cpu_power_cable',
  'gpu_power_cable',
  'ssd_power_cable',
  'hdd_power_cable',
  'ssd_data_cable',
  'hdd_data_cable',
  'cpu_fan_cable',
  'front_fan_cable',
  'rear_fan_cable',
  'front_panel_cable',
  'usb3_cable',
  'audio_cable',
]

/** Lifts a part straight out through the glass side when the model comes apart. */
const OUT = (explodeScale: number): Partial<PartDef> => ({ explodeDir: [0, 0, 1], explodeScale })

export const computer: ModelDefinition = {
  id: 'computer',
  slug: 'computer',
  url: '/models/computer.glb',
  groups: ['chassis', 'power', 'board', 'processor', 'memory', 'graphics', 'storage', 'airflow', 'cabling'],
  baseParts: ['case_frame'],
  cutaway: false,
  edges: false,
  glow: 0.5,
  initialRotation: [0.15, -0.5, 0],
  tour: computerTour,
  connected: true,
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
    cabling: 'sleeve',
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
  // Each part attaches to its first dependency; cables plug into their first dependency and come from the second.
  parts: [
    part('case_frame', 'chassis', [], { explodeScale: 0.3 }),
    part('psu', 'power', ['case_frame'], { explodeDir: [-0.3, -1, 0.6], explodeScale: 1.4 }),
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
    part('gpu', 'graphics', ['motherboard'], { explodeDir: [0, -0.3, 1], explodeScale: 2.2 }),
    part('m2_ssd', 'storage', ['motherboard'], OUT(2.2)),
    part('sata_ssd', 'storage', ['case_frame'], { explodeDir: [1, -0.2, 0.6], explodeScale: 1.6 }),
    part('hdd', 'storage', ['case_frame'], { explodeDir: [1, -0.6, 0.4], explodeScale: 1.6 }),
    part('front_fan', 'airflow', ['case_frame'], {
      info: 'case_fan',
      hint: 'case_fan',
      explodeDir: [1, 0, 0],
      explodeScale: 1.6,
    }),
    part('rear_fan', 'airflow', ['case_frame'], {
      info: 'case_fan',
      hint: 'case_fan',
      explodeDir: [-1, 0, 0],
      explodeScale: 1.6,
    }),
    cable('atx_cable', 'motherboard', 'psu', 'power', 'in'),
    cable('cpu_power_cable', 'motherboard', 'psu', 'power', 'in'),
    cable('gpu_power_cable', 'gpu', 'psu', 'power', 'in'),
    cable('ssd_power_cable', 'sata_ssd', 'psu', 'power', 'in', { info: 'sata_power', hint: 'sata_power' }),
    cable('hdd_power_cable', 'hdd', 'psu', 'power', 'in', { info: 'sata_power', hint: 'sata_power' }),
    cable('ssd_data_cable', 'motherboard', 'sata_ssd', 'data', 'in', {
      info: 'sata_data',
      hint: 'sata_data',
    }),
    cable('hdd_data_cable', 'motherboard', 'hdd', 'data', 'in', { info: 'sata_data', hint: 'sata_data' }),
    // The board powers the fans, so their current flows away from the header.
    cable('cpu_fan_cable', 'motherboard', 'cpu_fan', 'power', 'out', {
      info: 'fan_cable',
      hint: 'fan_cable',
    }),
    cable('front_fan_cable', 'motherboard', 'front_fan', 'power', 'out', {
      info: 'fan_cable',
      hint: 'fan_cable',
    }),
    cable('rear_fan_cable', 'motherboard', 'rear_fan', 'power', 'out', {
      info: 'fan_cable',
      hint: 'fan_cable',
    }),
    cable('front_panel_cable', 'motherboard', 'case_frame', 'data', 'in'),
    cable('usb3_cable', 'motherboard', 'case_frame', 'data', 'in'),
    cable('audio_cable', 'motherboard', 'case_frame', 'data', 'in'),
    part('side_panel', 'chassis', ['case_frame', ...SIDE_PANEL_LAST], {
      explodeDir: [0, 0, 1],
      explodeScale: 2.6,
    }),
  ],
}
