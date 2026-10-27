import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CameraErrorKind } from '../input/camera'
import type { InputStatus } from '../input/handInput'

export type CameraStatus = { state: 'requesting' } | { state: 'live' } | { state: 'mouse'; reason: CameraErrorKind }

export type LabMode = 'explore' | 'study' | 'assembly'

interface LabState {
  camera: CameraStatus
  tracking: InputStatus
  calibrating: 'quick' | 'full' | null
  settingsOpen: boolean
  debug: boolean
  devPanel: boolean
  creditsOpen: boolean
  tipsOpen: boolean
  /** Persisted user preferences. */
  headParallax: boolean
  /** The gesture tips were shown once already. */
  tipsSeen: boolean
  /** Hologram glow or physically based materials. */
  viewStyle: 'hologram' | 'realistic'
  /** Set while a realistic-only model is open. Not persisted, so the saved view style is kept. */
  forcedRealistic: boolean

  set: (patch: Partial<Omit<LabState, 'set'>>) => void
}

export const useLab = create<LabState>()(
  persist(
    (set) => ({
      camera: { state: 'requesting' },
      tracking: 'idle',
      calibrating: null,
      settingsOpen: false,
      debug: false,
      devPanel: false,
      creditsOpen: false,
      tipsOpen: false,
      headParallax: false,
      tipsSeen: false,
      viewStyle: 'hologram',
      forcedRealistic: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'hololemma.lab',
      partialize: (s) => ({ headParallax: s.headParallax, tipsSeen: s.tipsSeen, viewStyle: s.viewStyle }),
    },
  ),
)
