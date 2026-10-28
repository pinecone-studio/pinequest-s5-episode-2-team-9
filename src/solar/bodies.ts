import type { BodyId, PlanetId } from './astro'

export interface BodyInfo {
  id: BodyId
  /** Mean radius, km. */
  radiusKm: number
  /** Texture in /public/solar (see scripts/build-solar-textures.ts). */
  texture: string
  /** Label and orbit colour. */
  color: string
  /** Rim colour of the atmosphere, if it has one worth seeing. */
  atmosphere?: string
  /** Airless rock: lit with the Lommel–Seeliger law, so a full disc looks evenly bright. */
  regolith?: boolean
  /** Facts for the panel. Text lives in i18n under solar.body.<id>.* */
  facts: {
    /** Axial tilt to its own orbit, degrees. */
    tilt: number
    /** Sidereal rotation, hours (negative = retrograde). */
    dayHours: number
    /** Orbital period, Earth days. */
    yearDays?: number
    moons?: number
  }
}

export const PLANETS: PlanetId[] = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
]

// Facts: NASA Planetary Fact Sheets (nssdc.gsfc.nasa.gov/planetary/factsheet).
export const BODIES: Record<BodyId, BodyInfo> = {
  sun: {
    id: 'sun',
    radiusKm: 695_700,
    texture: 'sun',
    color: '#ffcf6b',
    facts: { tilt: 7.25, dayHours: 609.12 },
  },
  mercury: {
    id: 'mercury',
    radiusKm: 2_439.7,
    texture: 'mercury',
    color: '#a9a39b',
    regolith: true,
    facts: { tilt: 0.034, dayHours: 1407.6, yearDays: 87.969, moons: 0 },
  },
  venus: {
    id: 'venus',
    radiusKm: 6_051.8,
    texture: 'venus',
    color: '#e8cf9a',
    atmosphere: '#ffe2a8',
    facts: { tilt: 177.36, dayHours: -5832.5, yearDays: 224.701, moons: 0 },
  },
  earth: {
    id: 'earth',
    radiusKm: 6_371.0,
    texture: 'earth-day',
    color: '#5ea8ff',
    atmosphere: '#6aa8ff',
    facts: { tilt: 23.44, dayHours: 23.9345, yearDays: 365.256, moons: 1 },
  },
  moon: {
    id: 'moon',
    radiusKm: 1_737.4,
    texture: 'moon',
    color: '#cfcfcf',
    regolith: true,
    facts: { tilt: 6.68, dayHours: 655.72, yearDays: 27.3217 },
  },
  mars: {
    id: 'mars',
    radiusKm: 3_389.5,
    texture: 'mars',
    color: '#e0744a',
    atmosphere: '#e9a27a',
    facts: { tilt: 25.19, dayHours: 24.6229, yearDays: 686.98, moons: 2 },
  },
  jupiter: {
    id: 'jupiter',
    radiusKm: 69_911,
    texture: 'jupiter',
    color: '#d9b38c',
    atmosphere: '#e8d2b0',
    facts: { tilt: 3.13, dayHours: 9.925, yearDays: 4332.59, moons: 97 },
  },
  saturn: {
    id: 'saturn',
    radiusKm: 58_232,
    texture: 'saturn',
    color: '#e6d39a',
    atmosphere: '#efe0b4',
    facts: { tilt: 26.73, dayHours: 10.656, yearDays: 10759.22, moons: 274 },
  },
  uranus: {
    id: 'uranus',
    radiusKm: 25_362,
    texture: 'uranus',
    color: '#9fe3e8',
    atmosphere: '#b8f0f2',
    facts: { tilt: 97.77, dayHours: -17.24, yearDays: 30685.4, moons: 28 },
  },
  neptune: {
    id: 'neptune',
    radiusKm: 24_622,
    texture: 'neptune',
    color: '#5b7cff',
    atmosphere: '#8aa4ff',
    facts: { tilt: 28.32, dayHours: 16.11, yearDays: 60189, moons: 16 },
  },
}

/** Saturn's main rings (C ring inner edge to A ring outer edge), in Saturn radii. */
export const SATURN_RINGS = { inner: 74_658 / 58_232, outer: 136_775 / 58_232 }

export const textureUrl = (name: string) => `/solar/${name}.webp`
