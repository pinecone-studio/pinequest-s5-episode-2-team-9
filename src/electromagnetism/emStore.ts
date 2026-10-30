import { create } from 'zustand'
import type { Source } from './fields'
import type { EDirection, LorentzParams } from './lorentz'

export type EmView = 'current' | 'lorentz' | 'hopfion'
export type LorentzPreset = 'circle' | 'helix' | 'drift' | 'parallel'
export type HopfMode = 'volume' | 'slice'

const PRESETS: Record<LorentzPreset, Omit<LorentzParams, 'charge'>> = {
  circle: { b: 1.5, e: 0, eDir: 'perp', speed: 0.9, pitch: 90 },
  helix: { b: 1.5, e: 0, eDir: 'perp', speed: 0.9, pitch: 60 },
  drift: { b: 1.5, e: 0.35, eDir: 'perp', speed: 0.6, pitch: 90 },
  parallel: { b: 1.5, e: 0.25, eDir: 'para', speed: 0.9, pitch: 90 },
}

/**
 * Live particle readouts. The scene integrates every frame, so these live
 * outside React; the panel polls them a few times a second.
 */
export const lorentzLive = { speed: 0, time: 0 }

interface EmState {
  view: EmView
  labels: boolean

  // Current & field
  source: Source
  /** Amperes; the sign is the direction (positive = up the axis). */
  amps: number
  /** Probe position, scene units: distance from the wire, or height on the axis. */
  probe: number
  fieldLines: boolean
  carriers: boolean
  handRule: boolean

  // Lorentz force
  charge: 1 | -1
  b: number
  e: number
  eDir: EDirection
  speed: number
  pitch: number
  preset: LorentzPreset | null
  playing: boolean
  vectors: boolean
  vbPlane: boolean
  /** Increment to restart the particle. */
  resetToken: number

  // Hopfion
  hopfMode: HopfMode
  /** Slice plane offset, in core-ring radii. */
  slice: number
  preimages: boolean
  torus: boolean
  background: boolean
  precess: boolean

  set: (patch: Partial<Omit<EmState, 'set'>>) => void
  /** Changes a Lorentz parameter and restarts the particle. */
  setLorentz: (patch: Partial<LorentzParams>) => void
  applyPreset: (preset: LorentzPreset) => void
  restart: () => void
}

export const useEm = create<EmState>()((set, get) => ({
  view: 'current',
  labels: true,

  source: 'wire',
  amps: 10,
  probe: 0.5,
  fieldLines: true,
  carriers: true,
  handRule: true,

  charge: 1,
  ...PRESETS.helix,
  preset: 'helix',
  playing: true,
  vectors: true,
  vbPlane: true,
  resetToken: 0,

  hopfMode: 'volume',
  slice: 0,
  preimages: true,
  torus: false,
  background: false,
  precess: true,

  set,
  setLorentz: (patch) => set({ ...patch, preset: null, resetToken: get().resetToken + 1 }),
  applyPreset: (preset) => set({ ...PRESETS[preset], preset, resetToken: get().resetToken + 1 }),
  restart: () => set({ resetToken: get().resetToken + 1 }),
}))

export const lorentzParams = (s: Pick<EmState, keyof LorentzParams>): LorentzParams => ({
  charge: s.charge,
  b: s.b,
  e: s.e,
  eDir: s.eDir,
  speed: s.speed,
  pitch: s.pitch,
})
