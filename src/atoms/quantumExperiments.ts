// Probability rules for the quantum experiments.

/**
 * Double slit, far field: intensity at screen position x (same units as the
 * slit separation d and width a, screen distance L, wavelength λ).
 * Unobserved: two-slit interference × single-slit envelope.
 * Observed (which-slit detector on): no interference — the two slits add as
 * two separate bands.
 */
export interface SlitSetup {
  wavelength: number
  separation: number
  width: number
  distance: number
  observed: boolean
}

const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x)

export function slitIntensity(x: number, s: SlitSetup): number {
  const sinTheta = x / Math.hypot(x, s.distance)
  const envelope = sinc((Math.PI * s.width * sinTheta) / s.wavelength) ** 2
  if (!s.observed) return Math.cos((Math.PI * s.separation * sinTheta) / s.wavelength) ** 2 * envelope
  // Which-path known: each slit's own diffraction pattern, centred behind that slit.
  const band = (offset: number) => {
    const t = (x - offset) / Math.hypot(x - offset, s.distance)
    return sinc((Math.PI * s.width * t) / s.wavelength) ** 2
  }
  return 0.5 * (band(s.separation / 2) + band(-s.separation / 2))
}

/** Draws one landing position in [-halfWidth, halfWidth] by rejection sampling. */
export function sampleLanding(s: SlitSetup, halfWidth: number, rand: () => number): number {
  for (let i = 0; i < 10000; i++) {
    const x = (rand() * 2 - 1) * halfWidth
    if (rand() < slitIntensity(x, s)) return x
  }
  return 0
}

/**
 * Stern–Gerlach: a spin-½ particle measured along an axis at angle θ (radians)
 * to the axis of its current state comes out "up" with probability cos²(θ/2).
 */
export const probabilityUp = (angle: number) => Math.cos(angle / 2) ** 2

export type MagnetAxis = 'z' | 'x'

/** Angle between two measurement axes (z and x are 90° apart). */
export const axisAngle = (a: MagnetAxis, b: MagnetAxis) => (a === b ? 0 : Math.PI / 2)

export interface SpinPath {
  /** Outcome at each magnet: +1 up, −1 down; stops early if blocked. */
  outcomes: (1 | -1)[]
  /** Index of the magnet that blocked it (only "up" continues to the next magnet), or null. */
  blockedAt: number | null
}

/**
 * Sends one particle (initially random spin) through a row of magnets.
 * Only the "up" beam continues to the next magnet; "down" is caught.
 */
export function runSpin(axes: MagnetAxis[], rand: () => number): SpinPath {
  const outcomes: (1 | -1)[] = []
  let state: { axis: MagnetAxis; sign: 1 | -1 } | null = null
  for (let i = 0; i < axes.length; i++) {
    const axis = axes[i]
    let pUp = 0.5
    if (state) {
      const angle = axisAngle(state.axis, axis)
      pUp = state.sign === 1 ? probabilityUp(angle) : 1 - probabilityUp(angle)
    }
    const sign: 1 | -1 = rand() < pUp ? 1 : -1
    outcomes.push(sign)
    state = { axis, sign }
    if (sign === -1 && i < axes.length - 1) return { outcomes, blockedAt: i }
  }
  return { outcomes, blockedAt: null }
}
