// What the tutor knows beyond the study cards: how each part connects to the rest and, for anatomy,
// what can go wrong with it. Written in English; the tutor answers in the student's language.
// The same text goes into the fine-tuning data and into the live prompt, so keep it accurate and short.
// Every model in the library has a tutor that answers from its study cards; the models in
// KNOWLEDGE_MODELS also have these hand-written facts. scripts/tutorCards.test.ts checks that every
// part of those models has an entry.

export interface Connection {
  /** A part id of the same model, or a thing outside the model (e.g. 'lungs', 'wall socket'). */
  to: string
  /** How it connects: the vessel, valve, cable, connector or slot. */
  via: string
  /** What passes through, or a detail worth knowing. */
  detail?: string
}

export interface PartKnowledge {
  connections: Connection[]
  /** Anatomy: diseases and problems that affect this part. Educational only. */
  conditions?: string[]
  /** Anything else a curious student might ask about. */
  notes?: string[]
}

export const TUTOR_MODELS = [
  'heart',
  'lungs',
  'brain',
  'skeleton',
  'muscles',
  'robotDog',
  'rocketEngine',
  'electricMotor',
  'computer',
] as const
export type TutorModelId = (typeof TUTOR_MODELS)[number]

/** Models with hand-written connections and conditions below, on top of their study cards. */
export const KNOWLEDGE_MODELS = ['heart', 'computer'] as const satisfies readonly TutorModelId[]

export const isTutorModel = (id: unknown): id is TutorModelId => TUTOR_MODELS.includes(id as TutorModelId)

const heart: Record<string, PartKnowledge> = {
  right_atrium: {
    connections: [
      {
        to: 'superior_vena_cava',
        via: 'opening at the top',
        detail: 'oxygen-poor blood from the head, neck and arms',
      },
      {
        to: 'inferior_vena_cava',
        via: 'opening at the bottom',
        detail: 'oxygen-poor blood from the lower body',
      },
      {
        to: 'coronary_sinus',
        via: 'opening near the tricuspid valve',
        detail: 'oxygen-poor blood from the heart muscle itself',
      },
      { to: 'anterior_cardiac_veins', via: 'small openings in its front wall' },
      { to: 'right_ventricle', via: 'tricuspid_valve', detail: 'blood flows down into the ventricle' },
    ],
    conditions: [
      'Atrial fibrillation: the atria quiver instead of squeezing, so blood can pool and form clots.',
      'Atrial septal defect: a hole in the wall between the two atria, present from birth.',
    ],
    notes: [
      'The sinoatrial (SA) node, the heart’s natural pacemaker, sits in the wall of the right atrium and starts every heartbeat.',
    ],
  },
  left_atrium: {
    connections: [
      {
        to: 'pulmonary_vein',
        via: 'four openings, two on each side',
        detail: 'oxygen-rich blood from the lungs',
      },
      { to: 'left_ventricle', via: 'mitral_valve', detail: 'blood flows down into the ventricle' },
    ],
    conditions: [
      'Atrial fibrillation: the most common irregular heartbeat; clots that form here can travel to the brain and cause a stroke.',
      'Enlargement of the left atrium, often caused by a leaking or narrowed mitral valve or by high blood pressure.',
    ],
  },
  right_ventricle: {
    connections: [
      { to: 'right_atrium', via: 'tricuspid_valve', detail: 'receives oxygen-poor blood' },
      { to: 'pulmonary_trunk', via: 'pulmonary_valve', detail: 'pumps blood towards the lungs' },
      { to: 'septum', via: 'shared wall', detail: 'separates it from the left ventricle' },
      {
        to: 'papillary_muscles',
        via: 'attached to its inner wall',
        detail: 'they hold the tricuspid valve flaps',
      },
      {
        to: 'right_coronary_artery',
        via: 'runs over its surface',
        detail: 'its main blood supply, with the right marginal artery',
      },
    ],
    conditions: [
      'Right-sided heart failure: the ventricle cannot pump well, so blood backs up and the legs and belly swell.',
      'Pulmonary hypertension: high pressure in the lung arteries makes this ventricle work too hard and thicken.',
    ],
  },
  left_ventricle: {
    connections: [
      { to: 'left_atrium', via: 'mitral_valve', detail: 'receives oxygen-rich blood' },
      { to: 'aorta', via: 'aortic_valve', detail: 'pumps blood out to the whole body' },
      { to: 'septum', via: 'shared wall', detail: 'separates it from the right ventricle' },
      {
        to: 'papillary_muscles',
        via: 'attached to its inner wall',
        detail: 'they hold the mitral valve flaps',
      },
      {
        to: 'left_anterior_descending_artery',
        via: 'runs over its front',
        detail: 'with the diagonal and marginal branches, its blood supply',
      },
    ],
    conditions: [
      'Heart failure: the muscle becomes too weak or too stiff to pump enough blood; people feel tired and short of breath.',
      'Left ventricular hypertrophy: the wall thickens after years of high blood pressure.',
      'Heart attack (myocardial infarction): part of the muscle dies when a coronary artery is blocked; the left ventricle is the area most often affected.',
      'Cardiomyopathy: diseases of the heart muscle itself, some inherited.',
    ],
    notes: [
      'Its wall is about three times thicker than the right ventricle’s because it pumps blood around the whole body.',
    ],
  },
  septum: {
    connections: [
      { to: 'left_ventricle', via: 'shared wall' },
      { to: 'right_ventricle', via: 'shared wall' },
      {
        to: 'left_anterior_descending_artery',
        via: 'septal branches from the front',
        detail: 'most of its blood supply',
      },
      { to: 'posterior_descending_artery', via: 'septal branches from the back' },
    ],
    conditions: [
      'Ventricular septal defect (VSD): a hole in the septum, the most common heart defect present from birth; small ones often close on their own.',
      'Hypertrophic cardiomyopathy: an inherited thickening of the septum that can block blood leaving the left ventricle; a known cause of sudden collapse in young athletes.',
    ],
    notes: [
      'Special conducting fibres (the bundle of His and its branches) run down the septum and carry the electrical signal to both ventricles.',
    ],
  },
  papillary_muscles: {
    connections: [
      { to: 'chordae_tendineae', via: 'the cords start at their tips' },
      { to: 'left_ventricle', via: 'grow from its inner wall' },
      { to: 'right_ventricle', via: 'grow from its inner wall' },
    ],
    conditions: [
      'Papillary muscle rupture: a rare, serious problem after a heart attack that makes the mitral valve leak suddenly.',
    ],
    notes: [
      'They tighten when the ventricle squeezes, so the valve flaps cannot flip back into the atrium, like the ropes on a sail.',
    ],
  },
  chordae_tendineae: {
    connections: [
      { to: 'papillary_muscles', via: 'tied to their tips' },
      { to: 'tricuspid_valve', via: 'tied to the edges of its three flaps' },
      { to: 'mitral_valve', via: 'tied to the edges of its two flaps' },
    ],
    conditions: [
      'Ruptured chordae: a torn cord lets part of a valve flap flop back into the atrium, so the valve suddenly leaks.',
    ],
    notes: ['They are drawn into this model because the scan does not include them.'],
  },
  tricuspid_valve: {
    connections: [
      { to: 'right_atrium', via: 'opens from it' },
      { to: 'right_ventricle', via: 'opens into it' },
      { to: 'chordae_tendineae', via: 'its flaps are held by the cords' },
    ],
    conditions: [
      'Tricuspid regurgitation: the valve does not close fully and blood leaks back into the right atrium.',
      'Endocarditis: an infection of the valve flaps, more common in people who inject drugs.',
    ],
  },
  mitral_valve: {
    connections: [
      { to: 'left_atrium', via: 'opens from it' },
      { to: 'left_ventricle', via: 'opens into it' },
      { to: 'chordae_tendineae', via: 'its flaps are held by the cords' },
    ],
    conditions: [
      'Mitral valve prolapse: the flaps bulge back into the atrium; usually harmless.',
      'Mitral regurgitation: the valve leaks, so some blood flows backwards with each beat.',
      'Mitral stenosis: the valve becomes narrow and stiff, often after rheumatic fever in childhood.',
    ],
  },
  pulmonary_valve: {
    connections: [
      { to: 'right_ventricle', via: 'opens from it' },
      { to: 'pulmonary_trunk', via: 'opens into it' },
    ],
    conditions: [
      'Pulmonary stenosis: a narrow valve, usually present from birth, that makes the right ventricle work harder.',
    ],
    notes: ['It has three half-moon (semilunar) cusps and no cords; blood pressure alone closes it.'],
  },
  aortic_valve: {
    connections: [
      { to: 'left_ventricle', via: 'opens from it' },
      { to: 'aorta', via: 'opens into it' },
      { to: 'left_main_coronary_artery', via: 'starts in the aortic root just above it' },
      { to: 'right_coronary_artery', via: 'starts in the aortic root just above it' },
    ],
    conditions: [
      'Aortic stenosis: the valve stiffens and narrows with calcium, mostly in older people; it can cause chest pain and fainting.',
      'Aortic regurgitation: the valve leaks back into the left ventricle between beats.',
      'Bicuspid aortic valve: about 1 to 2 in 100 people are born with two cusps instead of three, which can wear out sooner.',
    ],
    notes: [
      'The "lub-dub" sound is valves closing: "lub" is the mitral and tricuspid valves, "dub" the aortic and pulmonary valves.',
    ],
  },
  aorta: {
    connections: [
      {
        to: 'aortic_valve',
        via: 'its root sits on the valve',
        detail: 'oxygen-rich blood from the left ventricle',
      },
      { to: 'brachiocephalic_artery', via: 'first branch of the arch' },
      { to: 'left_common_carotid_artery', via: 'second branch of the arch' },
      { to: 'left_subclavian_artery', via: 'third branch of the arch' },
      { to: 'chest, belly and legs', via: 'descending aorta' },
    ],
    conditions: [
      'Aortic aneurysm: a weak spot in the wall balloons outwards and can burst.',
      'Aortic dissection: a tear in the inner layer of the wall lets blood split the layers apart; a medical emergency.',
      'Coarctation of the aorta: a narrowing present from birth.',
      'Atherosclerosis: fatty plaque builds up in its wall.',
    ],
  },
  brachiocephalic_artery: {
    connections: [
      { to: 'aorta', via: 'leaves the top of the arch' },
      { to: 'right arm', via: 'right subclavian artery' },
      { to: 'right side of the head and brain', via: 'right common carotid artery' },
    ],
    conditions: ['Atherosclerosis here can reduce blood flow to the right arm or the brain.'],
  },
  left_common_carotid_artery: {
    connections: [
      { to: 'aorta', via: 'leaves the arch' },
      { to: 'left side of the head and brain', via: 'internal and external carotid arteries' },
    ],
    conditions: [
      'Carotid artery disease: plaque narrows the artery; a piece breaking off can cause a stroke.',
    ],
  },
  left_subclavian_artery: {
    connections: [
      { to: 'aorta', via: 'leaves the end of the arch' },
      { to: 'left arm', via: 'continues as the axillary artery' },
      { to: 'brain', via: 'the vertebral artery branch' },
    ],
  },
  pulmonary_trunk: {
    connections: [
      {
        to: 'pulmonary_valve',
        via: 'its base sits on the valve',
        detail: 'oxygen-poor blood from the right ventricle',
      },
      { to: 'right_pulmonary_artery', via: 'splits under the aortic arch' },
      { to: 'left_pulmonary_artery', via: 'splits under the aortic arch' },
    ],
    conditions: ['Pulmonary hypertension: blood pressure in the lung arteries is too high.'],
    notes: ['The pulmonary arteries are the only arteries that carry oxygen-poor blood.'],
  },
  right_pulmonary_artery: {
    connections: [
      { to: 'pulmonary_trunk', via: 'branches from it' },
      {
        to: 'right lung',
        via: 'divides inside the lung',
        detail: 'oxygen-poor blood goes to pick up oxygen',
      },
    ],
    conditions: [
      'Pulmonary embolism: a blood clot, often from a leg vein, gets stuck in a pulmonary artery and blocks blood flow to part of a lung.',
    ],
  },
  left_pulmonary_artery: {
    connections: [
      { to: 'pulmonary_trunk', via: 'branches from it' },
      { to: 'left lung', via: 'divides inside the lung', detail: 'oxygen-poor blood goes to pick up oxygen' },
    ],
    conditions: [
      'Pulmonary embolism: a blood clot, often from a leg vein, gets stuck in a pulmonary artery and blocks blood flow to part of a lung.',
      'Patent ductus arteriosus: the channel between this artery and the aorta stays open after birth.',
    ],
  },
  pulmonary_vein: {
    connections: [
      { to: 'lungs', via: 'an upper and a lower vein from each lung', detail: 'oxygen-rich blood' },
      { to: 'left_atrium', via: 'its own opening in the back wall' },
    ],
    conditions: [
      'Atrial fibrillation often starts from electrical signals near where these veins join the left atrium; doctors can treat it with ablation at this spot.',
    ],
    notes: ['They are the only veins that carry oxygen-rich blood.'],
  },
  superior_vena_cava: {
    connections: [
      { to: 'head, neck and arms', via: 'collects their veins', detail: 'oxygen-poor blood' },
      { to: 'right_atrium', via: 'opening at the top' },
    ],
    conditions: [
      'Superior vena cava syndrome: the vein is squeezed, often by a tumour in the chest, so the face and arms swell.',
    ],
  },
  inferior_vena_cava: {
    connections: [
      { to: 'legs, belly and lower body', via: 'collects their veins', detail: 'oxygen-poor blood' },
      { to: 'right_atrium', via: 'opening at the bottom' },
    ],
    conditions: [
      'Deep vein thrombosis: clots in the leg veins can travel up this vein, through the heart, and into the lungs.',
    ],
  },
  left_main_coronary_artery: {
    connections: [
      { to: 'aortic_valve', via: 'starts in the aortic root just above it' },
      { to: 'left_anterior_descending_artery', via: 'divides into it' },
    ],
    conditions: [
      'Coronary artery disease: fatty plaque narrows the artery, causing chest pain (angina) during effort.',
      'A narrowing of the left main is serious because it feeds most of the left ventricle.',
    ],
    notes: [
      'Doctors can open a narrowed artery with a stent, or build a bypass around it with a vessel taken from elsewhere in the body.',
    ],
  },
  left_anterior_descending_artery: {
    connections: [
      { to: 'left_main_coronary_artery', via: 'branches from it' },
      { to: 'diagonal_branches', via: 'gives them off along its course' },
      { to: 'septum', via: 'septal branches' },
      { to: 'left_ventricle', via: 'runs over its front' },
    ],
    conditions: [
      'Heart attack: a plaque breaks and a clot blocks the artery. A blockage here is especially dangerous because it feeds so much of the left ventricle.',
    ],
  },
  diagonal_branches: {
    connections: [
      { to: 'left_anterior_descending_artery', via: 'branch from it at an angle' },
      { to: 'left_ventricle', via: 'cross its side wall' },
      { to: 'left_marginal_branch', via: 'meets it in this scan' },
    ],
    conditions: ['Coronary artery disease can narrow them too, starving part of the left ventricle wall.'],
  },
  left_marginal_branch: {
    connections: [
      { to: 'diagonal_branches', via: 'joins them in this scan' },
      { to: 'left_ventricle', via: 'runs down its left edge' },
    ],
    notes: [
      'In most hearts it branches off the circumflex artery, which wraps around the left side of the heart.',
    ],
  },
  right_coronary_artery: {
    connections: [
      { to: 'aortic_valve', via: 'starts in the aortic root just above it' },
      { to: 'right_atrium', via: 'runs in the groove beside it' },
      { to: 'right_marginal_artery', via: 'gives it off along the lower edge' },
      { to: 'posterior_descending_artery', via: 'gives it off at the back' },
    ],
    conditions: [
      'Coronary artery disease and heart attack, as in the left coronary arteries.',
      'A blockage here can disturb the heartbeat, because in most people it supplies the SA and AV nodes.',
    ],
  },
  right_marginal_artery: {
    connections: [
      { to: 'right_coronary_artery', via: 'branches from it' },
      { to: 'right_ventricle', via: 'runs along its sharp lower edge' },
    ],
  },
  posterior_descending_artery: {
    connections: [
      { to: 'right_coronary_artery', via: 'branches from it (in a right-dominant heart)' },
      { to: 'septum', via: 'septal branches from the back' },
    ],
    notes: ['In about 8 out of 10 people it comes from the right coronary artery.'],
  },
  coronary_sinus: {
    connections: [
      { to: 'right_atrium', via: 'opens into it near the tricuspid valve' },
      { to: 'great_cardiac_vein', via: 'receives it' },
      { to: 'middle_cardiac_vein', via: 'receives it' },
      { to: 'small_cardiac_vein', via: 'receives it' },
    ],
    notes: ['Doctors can thread a pacemaker wire through the coronary sinus to reach the left ventricle.'],
  },
  great_cardiac_vein: {
    connections: [
      { to: 'coronary_sinus', via: 'drains into it' },
      { to: 'left_anterior_descending_artery', via: 'runs beside it' },
    ],
  },
  middle_cardiac_vein: {
    connections: [
      { to: 'coronary_sinus', via: 'drains into it' },
      { to: 'posterior_descending_artery', via: 'runs beside it' },
    ],
  },
  small_cardiac_vein: {
    connections: [
      { to: 'coronary_sinus', via: 'drains into it' },
      { to: 'right_marginal_artery', via: 'runs beside it' },
    ],
  },
  anterior_cardiac_veins: {
    connections: [
      { to: 'right_atrium', via: 'open straight into it' },
      { to: 'right_ventricle', via: 'drain its front wall' },
    ],
  },
}

const computer: Record<string, PartKnowledge> = {
  case_frame: {
    connections: [
      {
        to: 'motherboard',
        via: 'screws onto brass standoffs',
        detail: 'standoffs keep the board off the metal so it does not short',
      },
      { to: 'psu', via: 'four screws at the back, usually at the bottom' },
      {
        to: 'front panel',
        via: 'small cables to the motherboard front-panel header (power button, reset, LEDs), front USB header and HD audio header',
      },
      { to: 'hdd', via: '3.5-inch drive bay' },
      { to: 'sata_ssd', via: '2.5-inch drive mount' },
      { to: 'front_fan', via: 'screws at the front intake' },
      { to: 'rear_fan', via: 'screws at the rear exhaust' },
    ],
    notes: [
      'This is an ATX mid-tower: the ATX standard fixes where the board, the screw holes and the rear ports go.',
    ],
  },
  side_panel: {
    connections: [{ to: 'case_frame', via: 'thumbscrews or clips' }],
    notes: ['It has no electrical connections.'],
  },
  psu: {
    connections: [
      {
        to: 'wall socket',
        via: 'IEC C13 power cord into the C14 inlet at the back',
        detail: '230 V AC in Mongolia, 120 V in North America',
      },
      {
        to: 'atx_cable',
        via: 'modular sockets on its front',
        detail: 'outputs +12 V, +5 V and +3.3 V DC through each cable',
      },
    ],
    notes: [
      'The 12 V rail does most of the work: it feeds the processor (through the VRM), the graphics card and the fans.',
      'The 80 PLUS label (Bronze, Gold, Platinum…) tells how efficient it is; the rest is lost as heat.',
      'Never open a power supply: its capacitors can hold a dangerous charge even when unplugged.',
    ],
  },
  atx_cable: {
    connections: [
      {
        to: 'motherboard',
        via: '24-pin ATX main power connector',
        detail: 'the long 24-pin socket on the right edge of the board; a latch clicks over a tab',
      },
      { to: 'psu', via: 'the widest modular socket on the PSU' },
    ],
    notes: [
      'It carries +12 V, +5 V and +3.3 V, plus the "power on" signal that the front-panel button triggers through the board.',
    ],
  },
  cpu_power_cable: {
    connections: [
      {
        to: 'motherboard',
        via: '8-pin EPS 12 V (CPU_PWR) socket',
        detail: 'at the top-left of the board next to the VRM, reached through the top grommet',
      },
      { to: 'psu', via: 'a CPU/EPS modular socket' },
    ],
    notes: [
      'The 8-pin EPS (CPU) and 8-pin PCIe (GPU) plugs look alike but are keyed differently and are not interchangeable.',
    ],
  },
  gpu_power_cable: {
    connections: [
      {
        to: 'gpu',
        via: 'PCIe 6+2-pin or 12V-2x6 (12VHPWR) connector',
        detail: 'the power socket on the top edge of the card',
      },
      { to: 'psu', via: 'a PCIe modular socket' },
    ],
    notes: ['The slot gives up to 75 W; each 8-pin PCIe plug adds 150 W.'],
  },
  sata_power: {
    connections: [
      { to: 'sata_ssd', via: 'SATA power connector (15-pin, L-shaped)' },
      { to: 'hdd', via: 'SATA power connector (15-pin, L-shaped)' },
      { to: 'psu', via: 'a SATA/peripheral modular socket' },
    ],
    notes: [
      'SATA power (wide, 15 pins) and SATA data (narrow, 7 pins) are different cables; a drive needs both.',
    ],
  },
  sata_data: {
    connections: [
      {
        to: 'motherboard',
        via: 'SATA data port (7-pin, L-shaped)',
        detail: 'the right-angle ports on the lower right edge of the board, wired to the chipset',
      },
      { to: 'sata_ssd', via: 'its narrow 7-pin socket' },
      { to: 'hdd', via: 'its narrow 7-pin socket' },
    ],
    notes: ['SATA III tops out at about 600 MB/s.'],
  },
  fan_cable: {
    connections: [
      {
        to: 'motherboard',
        via: '4-pin PWM fan header',
        detail: 'CPU_FAN at the top of the board for the CPU fan, SYS_FAN (CHA_FAN) headers for case fans',
      },
      { to: 'cpu_fan', via: 'fixed to the fan frame' },
      { to: 'case_fan', via: 'fixed to the fan frame' },
    ],
    notes: [
      'A 3-pin fan plug also fits a 4-pin header; the board then controls speed by changing the voltage.',
    ],
  },
  front_panel_cable: {
    connections: [
      {
        to: 'motherboard',
        via: 'front-panel header (F_PANEL)',
        detail: 'the 2-row header on the bottom edge: power switch, reset switch, power LED and drive LED',
      },
      { to: 'case_frame', via: 'buttons and lights on the top of the case' },
    ],
    notes: ['Switches have no polarity, but LEDs do: the + pin must match.'],
  },
  usb3_cable: {
    connections: [
      { to: 'motherboard', via: '19-pin USB 3 header', detail: 'on the right edge of the board' },
      { to: 'case_frame', via: 'the USB ports on top of the case' },
    ],
  },
  audio_cable: {
    connections: [
      {
        to: 'motherboard',
        via: 'HD_AUDIO header',
        detail: 'at the bottom left of the board, near the audio codec',
      },
      { to: 'case_frame', via: 'the headphone and microphone jacks on top of the case' },
    ],
  },
  motherboard: {
    connections: [
      { to: 'atx_cable', via: '24-pin ATX socket on the right edge' },
      { to: 'cpu_power_cable', via: '8-pin CPU power socket at the top left' },
      { to: 'cpu', via: 'cpu_socket' },
      { to: 'ram_1', via: 'DIMM slot' },
      { to: 'ram_2', via: 'DIMM slot' },
      {
        to: 'gpu',
        via: 'PCIe x16 slot',
        detail: 'the top full-length slot, wired straight to the processor',
      },
      { to: 'm2_ssd', via: 'M.2 slot (M-key), held by one small screw' },
      {
        to: 'sata_ssd',
        via: 'SATA data port',
        detail: 'the L-shaped 7-pin ports along the lower right edge',
      },
      { to: 'hdd', via: 'SATA data port' },
      { to: 'cpu_fan', via: '4-pin CPU_FAN header' },
      { to: 'front_fan', via: '4-pin SYS_FAN (CHA_FAN) header' },
      { to: 'rear_fan', via: '4-pin SYS_FAN (CHA_FAN) header' },
      { to: 'io_shield', via: 'rear I/O ports line up with its holes' },
      { to: 'case_frame', via: 'screws onto standoffs' },
    ],
    notes: [
      '4-pin fan headers send PWM signals so the board can change the fan speed with temperature.',
      'The chipset links the processor to the SATA ports, extra USB ports and some PCIe lanes.',
    ],
  },
  io_shield: {
    connections: [
      { to: 'case_frame', via: 'snaps into the rectangular hole at the back' },
      { to: 'motherboard', via: 'surrounds its rear ports' },
      {
        to: 'outside devices',
        via: 'rear ports',
        detail:
          'USB-A and USB-C (keyboard, mouse), RJ-45 Ethernet (network), 3.5 mm audio jacks, and sometimes HDMI/DisplayPort for the processor’s built-in graphics',
      },
    ],
    notes: [
      'If the processor has no built-in graphics, the monitor must plug into the graphics card, not the board.',
    ],
  },
  vrm_heatsink: {
    connections: [
      { to: 'motherboard', via: 'screwed over the VRM chips around the socket' },
      { to: 'cpu_power_cable', via: 'the 8-pin CPU power socket sits right next to it' },
      { to: 'cpu', via: 'copper traces through the socket', detail: 'about 1 to 1.4 V at very high current' },
    ],
    notes: [
      'VRM stands for voltage regulator module. Each "phase" is a set of switches, a coil (choke) and capacitors.',
    ],
  },
  chipset_heatsink: {
    connections: [
      { to: 'motherboard', via: 'fixed over the chipset in the lower right' },
      { to: 'cpu', via: 'a fast dedicated link (DMI on Intel)' },
      { to: 'sata_ssd', via: 'the SATA ports are wired to the chipset' },
      { to: 'hdd', via: 'the SATA ports are wired to the chipset' },
    ],
  },
  cpu_socket: {
    connections: [
      { to: 'motherboard', via: 'soldered to the board' },
      {
        to: 'cpu',
        via: 'hundreds of tiny contacts, held by the lever and load plate',
        detail: 'the gold triangle on the processor lines up with the triangle on the socket',
      },
    ],
    notes: [
      'Intel uses LGA sockets (pins in the socket); AMD AM5 is also LGA, while older AMD chips had pins on the processor (PGA).',
    ],
  },
  cpu: {
    connections: [
      { to: 'cpu_socket', via: 'sits in it, aligned by the gold triangle' },
      { to: 'cpu_cooler', via: 'thermal paste between the lid and the cooler base' },
      { to: 'ram_1', via: 'memory controller inside the processor, through the DIMM slots' },
      { to: 'gpu', via: 'PCIe lanes to the x16 slot' },
      { to: 'm2_ssd', via: 'PCIe lanes to the main M.2 slot' },
      { to: 'chipset_heatsink', via: 'link to the chipset' },
      { to: 'vrm_heatsink', via: 'receives its power from the VRM' },
    ],
    notes: ['Thermal paste fills microscopic gaps; without it the processor overheats in seconds.'],
  },
  cpu_cooler: {
    connections: [
      { to: 'cpu', via: 'base pressed onto the lid with thermal paste' },
      { to: 'motherboard', via: 'mounting bracket around the socket' },
      { to: 'cpu_fan', via: 'clipped to the fins' },
    ],
    notes: [
      'Heat pipes hold a little liquid that boils at the hot end and condenses at the cool end, moving heat very fast.',
    ],
  },
  cpu_fan: {
    connections: [
      { to: 'cpu_cooler', via: 'clips onto the fin stack' },
      { to: 'motherboard', via: '4-pin PWM cable into the CPU_FAN header near the top of the board' },
    ],
    notes: ['If nothing is plugged into CPU_FAN, many boards show a warning at start-up.'],
  },
  ram: {
    connections: [
      {
        to: 'motherboard',
        via: 'DIMM slot (288-pin for DDR4 and DDR5)',
        detail: 'a notch off-centre lines up with a key in the slot; clips at the ends lock it',
      },
      { to: 'cpu', via: 'memory controller inside the processor' },
    ],
    notes: [
      'With two sticks, use the slots the manual marks (often the 2nd and 4th) so they run in dual channel, which doubles the bandwidth.',
    ],
  },
  m2_ssd: {
    connections: [
      {
        to: 'motherboard',
        via: 'M.2 slot (M-key), slid in at an angle and held by one screw',
        detail: 'gets both data and power from the slot, so no cables',
      },
      { to: 'cpu', via: 'PCIe (NVMe) lanes from the main M.2 slot' },
    ],
    notes: ['An NVMe M.2 drive can be five or more times faster than a SATA SSD.'],
  },
  gpu: {
    connections: [
      {
        to: 'motherboard',
        via: 'PCIe x16 slot',
        detail: 'the top full-length slot; a latch at the end locks it',
      },
      { to: 'gpu_power_cable', via: 'PCIe 6+2-pin or 12V-2x6 power connector on its top edge' },
      { to: 'case_frame', via: 'bracket screwed to the expansion slots at the back' },
      { to: 'monitor', via: 'its own HDMI and DisplayPort outputs on the bracket' },
    ],
    notes: [
      'The slot gives up to 75 W; a gaming card needs much more, which is why it has its own power cable.',
      'Plug the monitor into the graphics card, not the motherboard, or the card is not used.',
    ],
  },
  sata_ssd: {
    connections: [
      { to: 'motherboard', via: 'SATA data cable (7-pin) to a SATA port' },
      { to: 'sata_power', via: 'SATA power connector (15-pin)' },
      { to: 'sata_data', via: 'SATA data connector (7-pin)' },
      { to: 'case_frame', via: '2.5-inch mount' },
    ],
    notes: ['SATA III tops out at about 600 MB/s, which is why newer SSDs use M.2 NVMe instead.'],
  },
  hdd: {
    connections: [
      { to: 'motherboard', via: 'SATA data cable (7-pin) to a SATA port' },
      { to: 'sata_power', via: 'SATA power connector (15-pin)' },
      { to: 'sata_data', via: 'SATA data connector (7-pin)' },
      { to: 'case_frame', via: '3.5-inch drive bay' },
    ],
    notes: [
      'Its platters spin at 5,400 or 7,200 turns a minute; bumping it while running can damage the data.',
    ],
  },
  case_fan: {
    connections: [
      { to: 'motherboard', via: '3-pin or 4-pin cable into a SYS_FAN (CHA_FAN) header' },
      { to: 'case_frame', via: 'four screws at the front intake or the rear exhaust' },
    ],
    notes: [
      'The arrows on the fan frame show which way air flows; front fans blow in, the rear fan blows out.',
    ],
  },
}

export const knowledge: Partial<Record<TutorModelId, Record<string, PartKnowledge>>> = { heart, computer }
