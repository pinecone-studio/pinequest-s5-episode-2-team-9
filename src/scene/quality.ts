import { create } from 'zustand'

/** 2 = full effects, 1 = lighter (no chromatic aberration, dpr 1), 0 = minimal (no bloom, dpr 0.75). */
export type QualityLevel = 0 | 1 | 2

export const useQuality = create<{ level: QualityLevel; set: (level: QualityLevel) => void }>()((set) => ({
  level: 2,
  set: (level) => set({ level }),
}))

export const DPR_BY_LEVEL: Record<QualityLevel, [number, number]> = {
  2: [1, 2],
  1: [1, 1],
  0: [0.75, 0.75],
}
