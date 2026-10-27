// The cardiac cycle, shared by the 3D heart, the ECG trace and the phase label.

export type HeartPhase = 'atrial' | 'ventricular' | 'diastole'

export const heartClock = {
  /** Position within the current beat, 0..1. */
  t: 0,
  beats: 0,
  bpm: 72,
  running: false,
}

// Timing within one beat (fractions of the cycle).
export const ATRIAL = [0.0, 0.14] as const
export const VENTRICULAR = [0.16, 0.48] as const

export function phaseAt(t: number): HeartPhase {
  if (t >= ATRIAL[0] && t < ATRIAL[1]) return 'atrial'
  if (t >= VENTRICULAR[0] && t < VENTRICULAR[1]) return 'ventricular'
  return 'diastole'
}

/** Smooth 0→1→0 bump over [a, b]. */
export function bump(t: number, a: number, b: number): number {
  if (t < a || t > b) return 0
  return Math.sin((Math.PI * (t - a)) / (b - a))
}

/** Simplified ECG voltage for a moment in the beat: P wave, QRS complex, T wave. */
export function ecg(t: number): number {
  const g = (mu: number, w: number, a: number) => a * Math.exp(-((t - mu) ** 2) / (2 * w * w))
  return g(0.05, 0.022, 0.13) + g(0.148, 0.006, -0.12) + g(0.162, 0.007, 1) + g(0.178, 0.008, -0.28) + g(0.37, 0.04, 0.3)
}
