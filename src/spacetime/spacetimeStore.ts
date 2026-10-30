import { create } from 'zustand'
import { appleAt, DIAGRAM_C, DROP_HEIGHT, EARTH_G, type AppleState } from './apple'
import type { MassId } from './gravity'

export type SpacetimeView = 'grid' | 'apple' | 'orbits'

/**
 * The apple's clock. The scene advances it every frame, so it lives outside
 * React; the store mirrors the apple a few times a second for the panel.
 * `now` is lab time in seconds, `released` the moment the stem let go, and
 * `epoch` counts resets so the scene knows to clear the drawn worldline.
 */
export const appleClock = { now: 0, released: null as number | null, epoch: 0 }

/** Seconds since release (−1 while hanging). */
export const appleTime = () => (appleClock.released === null ? -1 : appleClock.now - appleClock.released)

interface SpacetimeState {
  view: SpacetimeView
  /** Grid view: which mass sits in the middle, and a multiplier on its mass. */
  body: MassId
  massScale: number
  /** Grid view: show the inflowing lattice, the clocks, or the rubber-sheet analogy instead. */
  flow: boolean
  clocks: boolean
  sheet: boolean
  /** Apple view: surface gravity as a multiple of Earth's, and quarter-speed playback. */
  gScale: number
  slowMo: boolean
  /** Mirror of the apple for the panel (~8 Hz). */
  apple: AppleState
  /** Orbits view. */
  rays: boolean
  orbit: boolean
  newton: boolean
  /** Semi-latus rectum of the orbit, in units of M. */
  orbitSize: number
  set: (patch: Partial<Omit<SpacetimeState, 'set'>>) => void
  drop: () => void
  resetApple: () => void
}

export const appleG = (gScale: number) => EARTH_G * gScale
const restingApple = (gScale: number) => appleAt(-1, DROP_HEIGHT, appleG(gScale), DIAGRAM_C)

export const useSpacetime = create<SpacetimeState>()((set, get) => ({
  view: 'grid',
  body: 'earth',
  massScale: 1,
  flow: true,
  clocks: true,
  sheet: false,
  gScale: 1,
  slowMo: false,
  apple: restingApple(1),
  rays: true,
  orbit: true,
  newton: false,
  orbitSize: 16,
  set,
  drop: () => {
    if (appleClock.released === null) appleClock.released = appleClock.now
  },
  resetApple: () => {
    appleClock.released = null
    appleClock.epoch++
    set({ apple: restingApple(get().gScale) })
  },
}))
