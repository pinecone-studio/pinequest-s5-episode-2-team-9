// Per-user calibration: hand size and pinch thresholds, stored in localStorage.

import type { HandTrack } from './handTracks'

export interface Calibration {
  version: 1
  /** Reference palm size (normalized video units) when the hands were shown. */
  palmSize: number
  /** Pinch ratio below which a pinch starts (grab). */
  grab: number
  /** Pinch ratio above which a pinch ends (release). Larger than grab: hysteresis. */
  release: number
  /** Measured closed/open pinch ratios (full calibration only). */
  pinchClosed?: number
  pinchOpen?: number
  /** Resting fingertip jitter as a fraction of palm size. */
  jitter?: number
  kind: 'default' | 'quick' | 'full'
}

export const DEFAULT_CALIBRATION: Calibration = {
  version: 1,
  palmSize: 0.12,
  grab: 0.34,
  release: 0.6,
  kind: 'default',
}

const STORAGE_KEY = 'hololemma.calibration'

export function loadCalibration(): Calibration | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Calibration
    return parsed.version === 1 && parsed.grab < parsed.release ? parsed : null
  } catch {
    return null
  }
}

export function saveCalibration(c: Calibration): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    // Not persisted; still used for this session.
  }
}

export function clearCalibration(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export const median = (values: number[]) => {
  if (values.length === 0) return NaN
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Derives grab/release thresholds from measured closed and open pinch ratios.
 * Falls back to the defaults if the measured range is implausible.
 */
export function thresholdsFromPinch(closed: number, open: number): { grab: number; release: number } {
  const range = open - closed
  if (!Number.isFinite(range) || range < 0.4 || closed > 0.45) {
    return { grab: DEFAULT_CALIBRATION.grab, release: DEFAULT_CALIBRATION.release }
  }
  return { grab: closed + range * 0.18, release: closed + range * 0.42 }
}

export type CalibrationStep = 'palms' | 'pinch' | 'fist' | 'done'

export interface CalibrationProgress {
  step: CalibrationStep
  /** 0..1 progress within the current step. */
  progress: number
  /** Pinches counted in the pinch step. */
  pinches: number
}

/**
 * Collects calibration samples from hand tracks.
 * quick: open palms only. full: open palms → pinch three times → fist.
 */
export class CalibrationSession {
  readonly mode: 'quick' | 'full'
  private step: CalibrationStep = 'palms'
  private palmMs = 0
  private palmSamples: number[] = []
  private jitterSamples: number[] = []
  private lastTip: { x: number; y: number } | null = null
  private pinchMins: number[] = []
  private pinchMaxes: number[] = []
  private currentMin = Infinity
  private currentMax = 0
  private inPinch = false
  private fistMs = 0
  private lastT: number | null = null

  static readonly PALM_MS = 1500
  static readonly FIST_MS = 600
  static readonly PINCHES = 3

  constructor(mode: 'quick' | 'full') {
    this.mode = mode
  }

  progress(): CalibrationProgress {
    const progress =
      this.step === 'palms'
        ? this.palmMs / CalibrationSession.PALM_MS
        : this.step === 'pinch'
          ? this.pinchMins.length / CalibrationSession.PINCHES
          : this.step === 'fist'
            ? this.fistMs / CalibrationSession.FIST_MS
            : 1
    return { step: this.step, progress: Math.min(1, progress), pinches: this.pinchMins.length }
  }

  /** Feed one frame of tracks. Returns the finished calibration once complete. */
  update(tracks: HandTrack[], now: number): Calibration | null {
    const dt = this.lastT === null ? 0 : Math.min(now - this.lastT, 100)
    this.lastT = now
    const live = tracks.filter((t) => !t.coasting)

    if (this.step === 'palms') {
      const open = live.filter((t) => t.pose.openPalm)
      if (open.length >= 2) {
        this.palmMs += dt
        open.forEach((t) => this.palmSamples.push(t.pose.palm))
        const tip = open[0].landmarks[8]
        if (this.lastTip) this.jitterSamples.push(Math.hypot(tip.x - this.lastTip.x, tip.y - this.lastTip.y) / open[0].pose.palm)
        this.lastTip = { x: tip.x, y: tip.y }
      } else {
        this.palmMs = Math.max(0, this.palmMs - dt * 2)
        this.lastTip = null
      }
      if (this.palmMs >= CalibrationSession.PALM_MS) {
        if (this.mode === 'quick') return this.finish()
        this.step = 'pinch'
      }
      return null
    }

    if (this.step === 'pinch') {
      const hand = live[0]
      if (!hand) return null
      const ratio = hand.pose.pinch
      if (!this.inPinch) {
        this.currentMax = Math.max(this.currentMax, ratio)
        if (ratio < 0.4 && this.currentMax > 0.7) {
          this.inPinch = true
          this.currentMin = ratio
        }
      } else {
        this.currentMin = Math.min(this.currentMin, ratio)
        if (ratio > 0.7) {
          this.inPinch = false
          this.pinchMins.push(this.currentMin)
          this.pinchMaxes.push(this.currentMax)
          this.currentMax = ratio
        }
      }
      if (this.pinchMins.length >= CalibrationSession.PINCHES) this.step = 'fist'
      return null
    }

    if (this.step === 'fist') {
      this.fistMs = live.some((t) => t.pose.fist) ? this.fistMs + dt : 0
      if (this.fistMs >= CalibrationSession.FIST_MS) return this.finish()
    }
    return null
  }

  private finish(): Calibration {
    this.step = 'done'
    const palmSize = median(this.palmSamples)
    const jitter = median(this.jitterSamples)
    if (this.mode === 'quick') {
      return { ...DEFAULT_CALIBRATION, palmSize, jitter, kind: 'quick' }
    }
    const pinchClosed = median(this.pinchMins)
    const pinchOpen = median(this.pinchMaxes)
    return {
      version: 1,
      palmSize,
      jitter,
      pinchClosed,
      pinchOpen,
      ...thresholdsFromPinch(pinchClosed, pinchOpen),
      kind: 'full',
    }
  }
}
