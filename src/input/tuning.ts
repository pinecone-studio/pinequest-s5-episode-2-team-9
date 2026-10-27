// Live-tunable gesture parameters (edited from the dev panel, persisted).
// Framework-agnostic: a plain object plus listeners.

export interface Tuning {
  /** One Euro filter for landmarks. */
  minCutoff: number
  beta: number
  dCutoff: number
  /** Hands below this tracker score are ignored. */
  minHandScore: number
  /** A pinch must stay closed this long before it counts as a grab (ms). */
  pinchHoldMs: number
  /** A pinch must stay open this long before it counts as a release (ms). */
  releaseHoldMs: number
  /** Keep a lost hand alive this long so a missed frame never drops a part (ms). */
  lostGraceMs: number
  /** Max wrist jump (normalized video units) to still count as the same hand. */
  trackMatchDistance: number
  /** Finger curl (deg, mcp+pip+dip bends) below which a finger counts as straight. */
  extendedMaxCurl: number
  /** Finger curl above which a finger counts as curled. */
  curledMinCurl: number
  /** Every finger must curl beyond this for a fist. */
  fistMinCurl: number
  /** Hold a fist this long for "back" (ms). */
  fistHoldMs: number
  /** Hover a HUD button this long to press it (ms). */
  dwellMs: number
  /** Two-hand pinch starting within this many model radii of the model = explode, else scale. */
  explodeNearRadius: number
  /** How much explode changes per unit of hand-distance change (relative to start distance). */
  explodeGain: number
  /** Cursor smoothing at render rate (0 = frozen, 1 = no smoothing). */
  cursorLerp: number
}

export const DEFAULT_TUNING: Tuning = {
  minCutoff: 1.2,
  beta: 8,
  dCutoff: 1,
  minHandScore: 0.6,
  pinchHoldMs: 80,
  releaseHoldMs: 60,
  lostGraceMs: 220,
  trackMatchDistance: 0.25,
  extendedMaxCurl: 70,
  curledMinCurl: 110,
  fistMinCurl: 150,
  fistHoldMs: 1000,
  dwellMs: 600,
  explodeNearRadius: 1.6,
  explodeGain: 1.4,
  cursorLerp: 0.45,
}

const STORAGE_KEY = 'hololemma.tuning'

type Listener = (tuning: Tuning) => void

function load(): Tuning {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_TUNING, ...(JSON.parse(raw) as Partial<Tuning>) }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return { ...DEFAULT_TUNING }
}

class TuningStore {
  private value: Tuning = load()
  private listeners = new Set<Listener>()

  get(): Tuning {
    return this.value
  }

  set(patch: Partial<Tuning>): void {
    this.value = { ...this.value, ...patch }
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.value))
    } catch {
      // Not persisted; still applied for this session.
    }
    this.listeners.forEach((l) => l(this.value))
  }

  reset(): void {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    this.value = { ...DEFAULT_TUNING }
    this.listeners.forEach((l) => l(this.value))
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const tuning = new TuningStore()
