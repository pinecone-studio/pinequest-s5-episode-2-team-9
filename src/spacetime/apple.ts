// The falling apple in Epstein's space–propertime picture: everything moves
// through spacetime at speed c. At rest all of it goes into time; falling
// turns the arrow, trading speed through time for speed through space.

export const EARTH_G = 9.81
/** Height of the branch above the ground (m). */
export const DROP_HEIGHT = 3
/**
 * The speed of light used in the diagram (m/s). With the real 3×10⁸ m/s the
 * arrow would turn by a millionth of a degree; this keeps it visible.
 */
export const DIAGRAM_C = 12

export interface AppleState {
  /** Seconds since release (negative: still hanging). */
  t: number
  /** Height above the ground (m). */
  height: number
  /** Downward speed (m/s). */
  speed: number
  /** Angle the spacetime arrow has turned from the time axis (rad). */
  angle: number
  /** Proper time on the apple's own clock since release (s). */
  tau: number
  /** Speed through time, c·cos θ, and through space, c·sin θ (m/s). */
  timeSpeed: number
  spaceSpeed: number
  landed: boolean
}

/** Seconds it takes to fall from height h with acceleration g. */
export function fallTime(h: number, g: number): number {
  return Math.sqrt((2 * h) / g)
}

/**
 * Proper time elapsed on a clock that has accelerated uniformly from rest for
 * t seconds: ∫√(1 − (gt/c)²) dt, written in closed form.
 */
export function properTime(t: number, g: number, c: number): number {
  if (t <= 0) return t
  // Clamped at s = 1 (reaching c), which the lab's settings never get near.
  const s = Math.min(1, (g * t) / c)
  return (c / g) * 0.5 * (s * Math.sqrt(1 - s * s) + Math.asin(s))
}

/** The apple t seconds after release from height h0, falling with g until it hits the ground. */
export function appleAt(t: number, h0: number, g: number, c: number): AppleState {
  const tf = fallTime(h0, g)
  const falling = Math.min(Math.max(t, 0), tf)
  const speed = t > 0 && t < tf ? g * t : 0
  const angle = Math.asin(Math.min(1, speed / c))
  // After landing the ground holds it still again, so its clock runs at the full rate.
  const tau = t <= tf ? properTime(t, g, c) : properTime(tf, g, c) + (t - tf)
  return {
    t,
    height: h0 - 0.5 * g * falling * falling,
    speed,
    angle,
    tau,
    timeSpeed: c * Math.cos(angle),
    spaceSpeed: c * Math.sin(angle),
    landed: t >= tf,
  }
}
