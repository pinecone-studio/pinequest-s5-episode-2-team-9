// Positions and orientations of the Sun, planets and Moon for a given moment.
// No three.js here: plain maths, tested against known events in astro.test.ts.
//
// Frame: ecliptic and equinox of J2000 (x → vernal equinox, z → ecliptic north),
// distances in AU (planets) or km (Moon). Sources:
//   Planets: E. M. Standish, "Keplerian Elements for Approximate Positions of the
//     Major Planets", JPL (Table 1, valid 1800–2050).
//   Moon: low-precision lunar theory from the Astronomical Almanac (≈0.3°).
//   Spin axes and rotation: IAU WGCCRE report 2015 (Archinal et al. 2018).

export type Vec3 = [number, number, number]

const RAD = Math.PI / 180
const J2000 = 2451545.0

/** Mean obliquity of the ecliptic at J2000: the angle between Earth's equator and its orbit. */
export const OBLIQUITY_J2000 = 23.4392911

export const AU_KM = 149_597_870.7

/** Days since J2000.0 (UTC is close enough to TT for drawing). */
export function daysSinceJ2000(ms: number): number {
  return ms / 86_400_000 + 2440587.5 - J2000
}

/** Mean obliquity of the date, degrees. It shrinks by ~0.47″ a year. */
export function obliquity(d: number): number {
  return OBLIQUITY_J2000 - 0.0130042 * (d / 36525)
}

// ---------------------------------------------------------------- planets

export type PlanetId = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

/** [a AU, e, I°, L°, ϖ°, Ω°] at J2000 and their rates per Julian century. */
type Elements = [number, number, number, number, number, number]

const ELEMENTS: Record<PlanetId, { at: Elements; rate: Elements }> = {
  mercury: {
    at: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    at: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  },
  // Earth–Moon barycentre; Earth itself is 4,670 km from it (see moonPosition).
  earth: {
    at: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  },
  mars: {
    at: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    at: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    at: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  uranus: {
    at: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  neptune: {
    at: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },
}

export interface Orbit {
  a: number
  e: number
  /** Radians. */
  i: number
  node: number
  /** Argument of perihelion. */
  peri: number
  /** Mean anomaly. */
  M: number
}

export function orbitAt(planet: PlanetId, d: number): Orbit {
  const T = d / 36525
  const { at, rate } = ELEMENTS[planet]
  const [a, e, I, L, varpi, node] = at.map((v, k) => v + rate[k] * T)
  return { a, e, i: I * RAD, node: node * RAD, peri: (varpi - node) * RAD, M: (L - varpi) * RAD }
}

/** Solves Kepler's equation M = E − e·sin E. */
export function eccentricAnomaly(M: number, e: number): number {
  const m = Math.atan2(Math.sin(M), Math.cos(M))
  let E = e < 0.8 ? m : Math.PI
  for (let k = 0; k < 12; k++) {
    const dE = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < 1e-12) break
  }
  return E
}

/** Point on the orbit at eccentric anomaly E, heliocentric ecliptic AU. */
export function orbitPoint(o: Orbit, E: number): Vec3 {
  const x = o.a * (Math.cos(E) - o.e)
  const y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E)
  const [cw, sw, cn, sn, ci, si] = [
    Math.cos(o.peri),
    Math.sin(o.peri),
    Math.cos(o.node),
    Math.sin(o.node),
    Math.cos(o.i),
    Math.sin(o.i),
  ]
  return [
    (cw * cn - sw * sn * ci) * x + (-sw * cn - cw * sn * ci) * y,
    (cw * sn + sw * cn * ci) * x + (-sw * sn + cw * cn * ci) * y,
    sw * si * x + cw * si * y,
  ]
}

/** Heliocentric ecliptic position in AU. */
export function planetPosition(planet: PlanetId, d: number): Vec3 {
  const o = orbitAt(planet, d)
  return orbitPoint(o, eccentricAnomaly(o.M, o.e))
}

// ---------------------------------------------------------------- Moon

/** Geocentric ecliptic position of the Moon (J2000 frame), km. */
export function moonPosition(d: number): Vec3 {
  const T = d / 36525
  const s = (deg: number) => Math.sin(deg * RAD)
  const c = (deg: number) => Math.cos(deg * RAD)
  const lon =
    218.32 +
    481267.881 * T +
    6.29 * s(135.0 + 477198.87 * T) -
    1.27 * s(259.3 - 413335.36 * T) +
    0.66 * s(235.7 + 890534.22 * T) +
    0.21 * s(269.9 + 954397.74 * T) -
    0.19 * s(357.5 + 35999.05 * T) -
    0.11 * s(186.5 + 966404.03 * T) -
    // The theory gives longitude of date; precession since J2000 moves the equinox 1.397° per century.
    1.397 * T
  const lat =
    5.13 * s(93.3 + 483202.02 * T) +
    0.28 * s(228.2 + 960400.89 * T) -
    0.28 * s(318.3 + 6003.15 * T) -
    0.17 * s(217.6 - 407332.21 * T)
  const parallax =
    0.9508 +
    0.0518 * c(135.0 + 477198.87 * T) +
    0.0095 * c(259.3 - 413335.36 * T) +
    0.0078 * c(235.7 + 890534.22 * T) +
    0.0028 * c(269.9 + 954397.74 * T)
  const r = EARTH_RADIUS_KM / Math.sin(parallax * RAD)
  return [r * c(lat) * c(lon), r * c(lat) * s(lon), r * s(lat)]
}

/** Longitude of the Moon's ascending node, degrees. It drifts backwards once every 18.6 years. */
export function moonNodeLongitude(d: number): number {
  return mod(125.04452 - 1934.136261 * (d / 36525), 360)
}

export const MOON_INCLINATION = 5.145
export const EARTH_RADIUS_KM = 6378.137
export const MOON_RADIUS_KM = 1737.4
/** Earth's mass over the Moon's: the barycentre sits 1/82.3 of the way to the Moon. */
export const EARTH_MOON_MASS_RATIO = 81.3006

// ---------------------------------------------------------------- spin

export type BodyId = PlanetId | 'sun' | 'moon'

/**
 * IAU rotation model: pole right ascension and declination (ICRF, degrees) and
 * the prime meridian angle W (degrees), each as value + rate·d (or ·T for the pole).
 */
const SPIN: Record<
  Exclude<BodyId, 'moon'>,
  { ra: number; dec: number; w0: number; wRate: number; raT?: number; decT?: number }
> = {
  sun: { ra: 286.13, dec: 63.87, w0: 84.176, wRate: 14.1844 },
  mercury: { ra: 281.0103, dec: 61.4155, w0: 329.5988, wRate: 6.1385108 },
  venus: { ra: 272.76, dec: 67.16, w0: 160.2, wRate: -1.4813688 },
  // Precession tilts Earth's pole away from the J2000 pole by ~0.15° by 2026.
  earth: { ra: 0, dec: 90, w0: 190.147, wRate: 360.9856235, raT: -0.641, decT: -0.557 },
  mars: { ra: 317.269202, dec: 54.432516, w0: 176.049863, wRate: 350.891982443297 },
  jupiter: { ra: 268.056595, dec: 64.495303, w0: 284.95, wRate: 870.536 },
  saturn: { ra: 40.589, dec: 83.537, w0: 38.9, wRate: 810.7939024 },
  uranus: { ra: 257.311, dec: -15.175, w0: 203.81, wRate: -501.1600928 },
  neptune: { ra: 299.36, dec: 43.46, w0: 249.978, wRate: 541.1397757 },
}

/** Pole RA/Dec and prime meridian W for the Moon, with its main periodic terms (it faces Earth). */
function moonSpin(d: number): { ra: number; dec: number; w: number } {
  const T = d / 36525
  const E = [
    125.045 - 0.0529921 * d,
    250.089 - 0.1059842 * d,
    260.008 + 13.0120009 * d,
    176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d,
    311.589 + 26.4057084 * d,
    134.963 + 13.064993 * d,
    276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d,
    15.134 - 0.1589763 * d,
    119.743 + 0.0036096 * d,
    239.961 + 0.1643573 * d,
    25.053 + 12.9590088 * d,
  ].map((v) => v * RAD)
  const s = (k: number) => Math.sin(E[k - 1])
  const c = (k: number) => Math.cos(E[k - 1])
  return {
    ra:
      269.9949 +
      0.0031 * T -
      3.8787 * s(1) -
      0.1204 * s(2) +
      0.07 * s(3) -
      0.0172 * s(4) +
      0.0072 * s(6) -
      0.0052 * s(10) +
      0.0043 * s(13),
    dec:
      66.5392 +
      0.013 * T +
      1.5419 * c(1) +
      0.0239 * c(2) -
      0.0278 * c(3) +
      0.0068 * c(4) -
      0.0029 * c(6) +
      0.0009 * c(7) +
      0.0008 * c(10) -
      0.0009 * c(13),
    w:
      38.3213 +
      13.17635815 * d +
      3.561 * s(1) +
      0.1208 * s(2) -
      0.0642 * s(3) +
      0.0158 * s(4) +
      0.0252 * s(5) -
      0.0066 * s(6) -
      0.0047 * s(7) -
      0.0046 * s(8) +
      0.0028 * s(9) +
      0.0052 * s(10) +
      0.004 * s(11) +
      0.0019 * s(12) -
      0.0044 * s(13),
  }
}

/** Equatorial (ICRF) → ecliptic J2000. */
export function equatorialToEcliptic([x, y, z]: Vec3): Vec3 {
  const e = OBLIQUITY_J2000 * RAD
  return [x, Math.cos(e) * y + Math.sin(e) * z, -Math.sin(e) * y + Math.cos(e) * z]
}

/**
 * A body's axes in the ecliptic frame: `pole` (north, by the IAU right-hand rule),
 * `meridian` (where longitude 0 points on the equator) and `east` (longitude +90°).
 */
export interface Spin {
  pole: Vec3
  meridian: Vec3
  east: Vec3
}

export function spin(body: BodyId, d: number): Spin {
  let ra: number, dec: number, w: number
  if (body === 'moon') {
    ;({ ra, dec, w } = moonSpin(d))
  } else {
    const s = SPIN[body]
    const T = d / 36525
    ;[ra, dec, w] = [s.ra + (s.raT ?? 0) * T, s.dec + (s.decT ?? 0) * T, s.w0 + s.wRate * d]
  }
  const [a, de, W] = [ra * RAD, dec * RAD, w * RAD]
  const pole: Vec3 = [Math.cos(de) * Math.cos(a), Math.cos(de) * Math.sin(a), Math.sin(de)]
  // The IAU node: where the body's equator crosses the ICRF equator, at RA α + 90°.
  const node: Vec3 = [-Math.sin(a), Math.cos(a), 0]
  const nodeEast = cross(pole, node)
  const meridian: Vec3 = [0, 1, 2].map((k) => node[k] * Math.cos(W) + nodeEast[k] * Math.sin(W)) as Vec3
  const p = equatorialToEcliptic(pole)
  const m = equatorialToEcliptic(meridian)
  return { pole: p, meridian: m, east: cross(p, m) }
}

/** Latitude and longitude (degrees) of the point on a body that faces direction `dir`. */
export function surfacePointFacing(s: Spin, dir: Vec3): { lat: number; lon: number } {
  const u = normalize(dir)
  const lat = Math.asin(clamp(dot(u, s.pole), -1, 1)) / RAD
  const lon = Math.atan2(dot(u, s.east), dot(u, s.meridian)) / RAD
  return { lat, lon }
}

// ---------------------------------------------------------------- Moon phase

/** Sun–Moon elongation seen from Earth, 0° = new, 180° = full; and the lit fraction. */
export function moonPhase(d: number): { elongation: number; illumination: number; waxing: boolean } {
  const earth = planetPosition('earth', d)
  const sunDir = normalize(scale(earth, -1))
  const moon = moonPosition(d)
  const moonDir = normalize(moon)
  const elongation = Math.acos(clamp(dot(sunDir, moonDir), -1, 1)) / RAD
  // Waxing while the Moon is east of the Sun (ahead in ecliptic longitude).
  const dLon = mod(Math.atan2(moon[1], moon[0]) - Math.atan2(sunDir[1], sunDir[0]), 2 * Math.PI)
  return { elongation, illumination: (1 - Math.cos(elongation * RAD)) / 2, waxing: dLon < Math.PI }
}

// ---------------------------------------------------------------- vectors

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1))
export const mod = (x: number, m: number) => ((x % m) + m) % m
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
