// Propellant paths through the rocket engine (gas-generator cycle, kerosene + liquid
// oxygen), in the build coordinates of scripts/build-rocket.ts (+y up, nozzle down).
// The motion shifts them onto the GLB, which the build script re-centred.
//
//   tanks → turbopump → main valves → (fuel: up the cooling channels in the nozzle
//   wall) → injector → combustion chamber → throat → nozzle → exhaust plume
//   A little of each propellant burns in the gas generator to drive the turbine;
//   its exhaust leaves through the turbine exhaust pipe.
import type { SegmentDef, V3 } from './circuit'

// Mirrors the chamber contour in scripts/build-rocket.ts.
const Y_INJECTOR = 1.0
const Y_CHAMBER_END = 0.62
const Y_THROAT = 0.36
const Y_EXIT = -1.35
const R_CHAMBER = 0.24
const R_THROAT = 0.105
const R_EXIT = 0.56

export function contourRadius(y: number): number {
  if (y >= Y_CHAMBER_END) return R_CHAMBER
  if (y >= Y_THROAT) {
    const t = (Y_CHAMBER_END - y) / (Y_CHAMBER_END - Y_THROAT)
    return R_THROAT + (R_CHAMBER - R_THROAT) * (0.5 + 0.5 * Math.cos(t * Math.PI))
  }
  const t = (Y_THROAT - y) / (Y_THROAT - Y_EXIT)
  return R_THROAT + (R_EXIT - R_THROAT) * (1 - Math.pow(1 - t, 1.9))
}

const PUMP_X = -0.62
const LOX_PUMP_Y = 1.26
const FUEL_PUMP_Y = 0.98
const GG: V3 = [PUMP_X + 0.02, 0.62, 0.24]

export const LOX = '#6fc4ff'
export const KEROSENE = '#ffc23d'
const HOT_FUEL = '#ffe08a'
const FLAME = '#fff3c4'
const ORANGE = '#ff8a2e'

/** Points around a pump volute, spiralling out from the eye to the discharge. */
function volute(y: number, r: number, from: V3, to: V3): V3[] {
  const pts: V3[] = [from]
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * 0.6 + (k / 10) * Math.PI * 2.2
    pts.push([PUMP_X + Math.cos(a) * r * (0.5 + k * 0.05), y, Math.sin(a) * r * (0.5 + k * 0.05)])
  }
  pts.push(to)
  return pts
}

/** Streams through the chamber: radial fraction of the wall and angle. */
const STREAMS: [number, number][] = [
  [0.05, 0],
  [0.45, 0.3],
  [0.45, 2.4],
  [0.45, 4.5],
  [0.8, 1.3],
  [0.8, 3.4],
  [0.8, 5.5],
]
/** Cooling channels fed with fuel (angles). */
const CHANNELS = [0.4, 1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0]
const MANIFOLD_IN_Y = -0.32

const at = (f: number, a: number, y: number, scale = 1): V3 => {
  const r = contourRadius(y) * f * scale
  return [Math.cos(a) * r, y, Math.sin(a) * r]
}

const streamNext = (prefix: string) => STREAMS.map((_, k) => ({ id: `${prefix}${k}` }))

export const ROCKET_SEGMENTS: SegmentDef[] = [
  // ---- Liquid oxygen ----
  {
    id: 'lox_tank',
    points: [[PUMP_X, 2.3, 0], [PUMP_X, 2.0, 0], [PUMP_X, 1.7, 0], [PUMP_X, 1.36, 0]],
    radius: 0.04,
    color: LOX,
    source: 1,
    next: [{ id: 'lox_pump' }],
  },
  {
    id: 'lox_pump',
    points: volute(LOX_PUMP_Y, 0.12, [PUMP_X, 1.33, 0], [PUMP_X + 0.2, LOX_PUMP_Y, 0.06]),
    radius: 0.025,
    color: LOX,
    next: [{ id: 'lox_line', weight: 0.92 }, { id: 'gg_lox', weight: 0.08 }],
  },
  {
    id: 'lox_line',
    gate: 'main',
    points: [[PUMP_X + 0.2, LOX_PUMP_Y, 0.06], [-0.38, 1.32, 0.05], [-0.3, 1.32, 0.04], [-0.2, 1.3, 0.02], [-0.06, 1.24, 0], [0, 1.13, 0]],
    radius: 0.032,
    color: LOX,
    next: streamNext('inject_ox'),
  },
  ...STREAMS.map(([f, a], k) => ({
    id: `inject_ox${k}`,
    points: [[0, 1.12, 0], at(f * 0.7, a, 1.04), at(f, a, Y_INJECTOR - 0.03)] as V3[],
    radius: 0.02,
    color: LOX,
    next: [{ id: `chamber${k}` }],
  })),

  // ---- Kerosene ----
  {
    id: 'fuel_tank',
    points: [[PUMP_X + 0.05, 2.3, -0.22], [PUMP_X + 0.05, 2.0, -0.22], [PUMP_X + 0.05, 1.5, -0.2], [PUMP_X, 1.05, -0.06]],
    radius: 0.035,
    color: KEROSENE,
    source: 1,
    next: [{ id: 'fuel_pump' }],
  },
  {
    id: 'fuel_pump',
    points: volute(FUEL_PUMP_Y, 0.1, [PUMP_X, 1.04, -0.02], [PUMP_X + 0.17, FUEL_PUMP_Y, 0.05]),
    radius: 0.022,
    color: KEROSENE,
    next: [{ id: 'fuel_line', weight: 0.9 }, { id: 'gg_fuel', weight: 0.1 }],
  },
  {
    id: 'fuel_line',
    gate: 'main',
    points: [
      [PUMP_X + 0.17, FUEL_PUMP_Y, 0.05],
      [-0.38, 0.6, 0.12],
      [-0.39, 0.42, 0.13],
      [-0.36, 0.1, 0.14],
      [-0.3, -0.25, 0.1],
      [-contourRadius(MANIFOLD_IN_Y) - 0.035, MANIFOLD_IN_Y, 0.02],
    ],
    radius: 0.028,
    color: KEROSENE,
    next: CHANNELS.map((_, k) => ({ id: `cool${k}` })),
  },
  ...CHANNELS.map((a, k) => {
    // Round the inlet manifold to this channel, then up the nozzle wall to the injector.
    const pts: V3[] = []
    const from = Math.PI
    const steps = 6
    for (let i = 0; i <= steps; i++) {
      const ang = from + ((a - from) * i) / steps
      const r = contourRadius(MANIFOLD_IN_Y) + 0.035
      pts.push([Math.cos(ang) * r, MANIFOLD_IN_Y, Math.sin(ang) * r])
    }
    for (let i = 1; i <= 10; i++) {
      const y = MANIFOLD_IN_Y + ((0.95 - MANIFOLD_IN_Y) * i) / 10
      const r = contourRadius(y) + 0.03
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r])
    }
    pts.push([Math.cos(a) * 0.12, 1.08, Math.sin(a) * 0.12], [0, 1.12, 0])
    return {
      id: `cool${k}`,
      points: pts,
      radius: 0.012,
      color: [KEROSENE, HOT_FUEL] as [string, string],
      next: streamNext('inject_fuel'),
    }
  }),
  ...STREAMS.map(([f, a], k) => ({
    id: `inject_fuel${k}`,
    points: [[0, 1.12, 0], at(f * 0.6, a + 0.4, 1.05), at(f, a + 0.15, Y_INJECTOR - 0.03)] as V3[],
    radius: 0.02,
    color: HOT_FUEL,
    next: [{ id: `chamber${k}` }],
  })),

  // ---- Combustion: slow in the chamber, sonic at the throat, supersonic in the nozzle ----
  ...STREAMS.map(([f, a], k) => ({
    id: `chamber${k}`,
    points: [at(f, a, Y_INJECTOR - 0.03), at(f, a, 0.85), at(f, a, Y_CHAMBER_END)] as V3[],
    radius: 0.035,
    color: [FLAME, '#ffe7a6'] as [string, string],
    next: [{ id: `throat${k}` }],
  })),
  ...STREAMS.map(([f, a], k) => ({
    id: `throat${k}`,
    points: [at(f, a, Y_CHAMBER_END), at(f, a, 0.48), at(f, a, Y_THROAT), at(f, a, 0.2)] as V3[],
    radius: 0.012,
    color: ['#ffe7a6', '#ffc36b'] as [string, string],
    next: [{ id: `nozzle${k}` }],
  })),
  ...STREAMS.map(([f, a], k) => ({
    id: `nozzle${k}`,
    points: [0.2, -0.1, -0.5, -0.9, Y_EXIT].map((y) => at(f, a, y, 0.92)),
    radius: 0.02,
    color: ['#ffc36b', ORANGE] as [string, string],
    next: [{ id: `plume${k}` }],
  })),
  ...STREAMS.map(([f, a], k) => ({
    id: `plume${k}`,
    points: [at(f, a, Y_EXIT, 0.92), [Math.cos(a) * R_EXIT * f * 0.95, -2.0, Math.sin(a) * R_EXIT * f * 0.95], [Math.cos(a) * R_EXIT * f * 0.9, -2.8, Math.sin(a) * R_EXIT * f * 0.9]] as V3[],
    radius: 0.05,
    color: [ORANGE, '#ff4a1c'] as [string, string],
  })),

  // ---- Gas generator: a small burner that drives the turbine ----
  {
    id: 'gg_lox',
    points: [[PUMP_X + 0.2, LOX_PUMP_Y, 0.06], [PUMP_X + 0.1, 1.0, 0.22], [PUMP_X + 0.03, 0.72, 0.24], GG],
    radius: 0.012,
    color: LOX,
    next: [{ id: 'gg_burn' }],
  },
  {
    id: 'gg_fuel',
    points: [[PUMP_X + 0.17, FUEL_PUMP_Y, 0.05], [PUMP_X + 0.08, 0.8, 0.2], GG],
    radius: 0.012,
    color: KEROSENE,
    next: [{ id: 'gg_burn' }],
  },
  {
    id: 'gg_burn',
    points: [GG, [GG[0], 0.46, GG[2]], [GG[0], 0.37, GG[2]], [GG[0], 0.33, GG[2] - 0.08], [PUMP_X, 0.6, 0.1], [PUMP_X + 0.1, 0.7, 0.05]],
    radius: 0.014,
    color: [FLAME, ORANGE],
    next: [{ id: 'turbine' }],
  },
  {
    id: 'turbine',
    points: [[PUMP_X + 0.1, 0.7, 0.05], [PUMP_X, 0.7, 0.12], [PUMP_X - 0.12, 0.7, 0], [PUMP_X, 0.7, -0.12], [PUMP_X + 0.06, 0.69, -0.04], [PUMP_X, 0.66, 0]],
    radius: 0.02,
    color: [ORANGE, '#d9773a'],
    next: [{ id: 'turbine_exhaust' }],
  },
  {
    id: 'turbine_exhaust',
    points: [[PUMP_X, 0.66, 0], [PUMP_X - 0.08, 0.4, 0], [PUMP_X - 0.16, 0.0, 0], [PUMP_X - 0.24, -0.45, 0], [PUMP_X - 0.3, -0.75, 0], [PUMP_X - 0.34, -0.95, 0], [PUMP_X - 0.45, -1.7, 0]],
    radius: [0.03, 0.035, 0.04, 0.045, 0.05, 0.07, 0.14],
    color: ['#d9773a', '#5c5149'],
  },
]

/** Follow a drop of kerosene from the tank to the exhaust. */
export const ROCKET_TRACER = ['fuel_tank', 'fuel_pump', 'fuel_line', 'cool2', 'inject_fuel1', 'chamber1', 'throat1', 'nozzle1', 'plume1']

/** Which stage of the journey a segment belongs to (for the panel's caption). */
export function rocketRegion(id: string): string {
  if (id.endsWith('_tank')) return 'tank'
  if (id.endsWith('_pump')) return 'pump'
  if (id.endsWith('_line')) return 'valve'
  if (id.startsWith('cool')) return 'cooling'
  if (id.startsWith('inject')) return 'injector'
  if (id.startsWith('chamber')) return 'chamber'
  if (id.startsWith('throat')) return 'throat'
  if (id.startsWith('nozzle')) return 'nozzle'
  if (id.startsWith('plume')) return 'plume'
  return 'generator'
}
