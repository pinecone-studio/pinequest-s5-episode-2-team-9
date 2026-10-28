import { create } from 'zustand'
import type { BodyId } from './astro'

export type SolarView = 'system' | 'earth' | 'moon'

/** Simulated seconds per real second. */
export const RATES = [1, 3600, 21_600, 86_400, 604_800, 2_592_000] as const
export type Rate = (typeof RATES)[number]

const DEFAULT_RATE: Record<SolarView, Rate> = { system: 604_800, earth: 3600, moon: 86_400 }

/**
 * The simulated clock. The scene advances it every frame, so it lives outside
 * React; the store below mirrors it a few times a second for the panel.
 */
export const solarClock = { ms: Date.now(), rate: DEFAULT_RATE.system as number, playing: true }

interface SolarState {
  view: SolarView
  /** Body the system view centres on. */
  focus: BodyId
  /** Mirror of solarClock.ms for the panel (~8 Hz). */
  ms: number
  rate: Rate
  playing: boolean
  labels: boolean
  orbits: boolean
  /** Earth view: equator, tropics and polar circles. */
  latitudes: boolean
  /** Earth–Moon view: true sizes instead of enlarged bodies. */
  trueScale: boolean
  stars: boolean
  /** Earth–Moon view: exaggerated ocean tide shell. */
  tides: boolean
  /** Turn the Earth view so the Sun stays on the left (makes the seasons easy to see). */
  sunLeft: boolean
  set: (patch: Partial<Omit<SolarState, 'set'>>) => void
  setView: (view: SolarView) => void
  setRate: (rate: Rate) => void
  setPlaying: (playing: boolean) => void
  jumpTo: (ms: number) => void
}

export const useSolar = create<SolarState>()((set) => ({
  view: 'system',
  focus: 'sun',
  ms: solarClock.ms,
  rate: DEFAULT_RATE.system,
  playing: true,
  labels: true,
  orbits: true,
  latitudes: true,
  trueScale: false,
  stars: true,
  tides: true,
  sunLeft: true,
  set,
  setView: (view) => {
    solarClock.rate = DEFAULT_RATE[view]
    set({ view, rate: DEFAULT_RATE[view], focus: 'sun' })
  },
  setRate: (rate) => {
    solarClock.rate = rate
    set({ rate })
  },
  setPlaying: (playing) => {
    solarClock.playing = playing
    set({ playing })
  },
  jumpTo: (ms) => {
    solarClock.ms = ms
    set({ ms })
  },
}))

/** Notable moments to jump to (UTC). */
export const EVENTS: { id: string; iso: string; view: SolarView }[] = [
  { id: 'marchEquinox', iso: '2026-03-20T14:46:00Z', view: 'earth' },
  { id: 'juneSolstice', iso: '2026-06-21T08:24:00Z', view: 'earth' },
  { id: 'septemberEquinox', iso: '2026-09-23T00:05:00Z', view: 'earth' },
  { id: 'decemberSolstice', iso: '2026-12-21T20:50:00Z', view: 'earth' },
  { id: 'lunarEclipse', iso: '2026-03-03T11:33:00Z', view: 'moon' },
  { id: 'solarEclipse', iso: '2026-08-12T17:46:00Z', view: 'moon' },
]
