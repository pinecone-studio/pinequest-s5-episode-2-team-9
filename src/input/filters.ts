// One Euro filter (Casiez et al. 2012): strong smoothing when the hand is
// still, low lag when it moves fast. Timestamps are in milliseconds.

export interface OneEuroParams {
  /** Minimum cutoff frequency in Hz. Lower = smoother at rest. */
  minCutoff: number
  /** Speed coefficient. Higher = less lag during fast motion. */
  beta: number
  /** Cutoff for the derivative, in Hz. */
  dCutoff: number
}

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuroFilter {
  private x: number | null = null
  private dx = 0
  private lastT = 0
  private params: OneEuroParams

  constructor(params: OneEuroParams) {
    this.params = params
  }

  setParams(params: OneEuroParams): void {
    this.params = params
  }

  reset(): void {
    this.x = null
    this.dx = 0
  }

  filter(value: number, timestampMs: number): number {
    if (this.x === null) {
      this.x = value
      this.lastT = timestampMs
      return value
    }
    const dt = Math.max((timestampMs - this.lastT) / 1000, 1e-3)
    this.lastT = timestampMs
    const { minCutoff, beta, dCutoff } = this.params
    const rawDx = (value - this.x) / dt
    this.dx += alpha(dCutoff, dt) * (rawDx - this.dx)
    const cutoff = minCutoff + beta * Math.abs(this.dx)
    this.x += alpha(cutoff, dt) * (value - this.x)
    return this.x
  }
}

/** Filters a list of 3D points (e.g. the 21 hand landmarks) component-wise. */
export class PointsFilter {
  private filters: OneEuroFilter[] = []
  private params: OneEuroParams

  constructor(params: OneEuroParams) {
    this.params = params
  }

  setParams(params: OneEuroParams): void {
    this.params = params
    this.filters.forEach((f) => f.setParams(params))
  }

  filter(points: ReadonlyArray<{ x: number; y: number; z: number }>, timestampMs: number) {
    while (this.filters.length < points.length * 3) this.filters.push(new OneEuroFilter(this.params))
    return points.map((p, i) => ({
      x: this.filters[i * 3].filter(p.x, timestampMs),
      y: this.filters[i * 3 + 1].filter(p.y, timestampMs),
      z: this.filters[i * 3 + 2].filter(p.z, timestampMs),
    }))
  }
}
