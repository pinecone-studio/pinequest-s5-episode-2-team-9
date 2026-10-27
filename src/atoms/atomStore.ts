import { create } from 'zustand'
import type { OrbitalQuantumNumbers } from './orbitals'
import { MAX_Z } from './elements'
import { emissionWavelengthNm } from './spectrum'

export type AtomTab = 'build' | 'orbitals' | 'light' | 'experiments'
export type Particle = 'proton' | 'neutron' | 'electron'
export type Experiment = 'slit' | 'spin'
export type SpinSetup = 'z' | 'zz' | 'zx' | 'zxz'

export interface Photon {
  id: number
  nm: number
  from: number
  to: number
  kind: 'emitted' | 'absorbed'
}

interface AtomState {
  tab: AtomTab
  protons: number
  neutrons: number
  electrons: number
  orbital: OrbitalQuantumNumbers
  /** Current level of the hydrogen electron in the light tab. */
  level: number
  /** Level the electron is heading to (animating), or null. */
  target: number | null
  photons: Photon[]
  experiment: Experiment
  observed: boolean
  slitSeparation: number
  slitWavelength: number
  /** Particles per second. */
  rate: number
  spinSetup: SpinSetup
  /** Increment to clear experiment results. */
  clearToken: number

  set: (patch: Partial<AtomState>) => void
  add: (p: Particle, delta: 1 | -1) => void
  setOrbital: (q: Partial<OrbitalQuantumNumbers>) => void
  excite: (to: number) => void
  settle: () => void
}

const LIMITS: Record<Particle, number> = { proton: MAX_Z, neutron: 30, electron: MAX_Z + 2 }
let photonId = 0

export const useAtom = create<AtomState>()((set, get) => ({
  tab: 'build',
  protons: 1,
  neutrons: 0,
  electrons: 1,
  orbital: { n: 2, l: 1, m: 0 },
  level: 1,
  target: null,
  photons: [],
  experiment: 'slit',
  observed: false,
  slitSeparation: 6,
  slitWavelength: 1,
  rate: 40,
  spinSetup: 'zx',
  clearToken: 0,

  set: (patch) => set(patch),

  add: (p, delta) => {
    const key = p === 'proton' ? 'protons' : p === 'neutron' ? 'neutrons' : 'electrons'
    const next = Math.min(LIMITS[p], Math.max(0, get()[key] + delta))
    set({ [key]: next } as Partial<AtomState>)
  },

  setOrbital: (q) => {
    const cur = { ...get().orbital, ...q }
    cur.n = Math.min(4, Math.max(1, cur.n))
    cur.l = Math.min(cur.n - 1, Math.max(0, cur.l))
    cur.m = Math.min(cur.l, Math.max(-cur.l, cur.m))
    set({ orbital: cur })
  },

  /** Absorb a photon: jump from the current level up to `to`. */
  excite: (to) => {
    const { level, target } = get()
    if (target !== null || to <= level || to > 6) return
    const photon: Photon = {
      id: ++photonId,
      nm: emissionWavelengthNm(to, level),
      from: level,
      to,
      kind: 'absorbed',
    }
    set({ target: to, photons: [...get().photons.slice(-40), photon] })
  },

  /**
   * Called by the scene when a jump animation finishes. After an upward jump
   * the electron falls back down one level at a time, emitting a photon each step.
   */
  settle: () => {
    const { target, level } = get()
    if (target !== null) {
      set({ level: target, target: null })
      return
    }
    if (level > 1) {
      // Fall to a random lower level (cascades happen naturally).
      const to = 1 + Math.floor(Math.random() * (level - 1))
      const photon: Photon = {
        id: ++photonId,
        nm: emissionWavelengthNm(level, to),
        from: level,
        to,
        kind: 'emitted',
      }
      set({ target: to, photons: [...get().photons.slice(-40), photon] })
    }
  },
}))
