// Synthetic hands for tests, in isotropic units (palm size ≈ 0.1).
import type { Vec3 } from '../types'

type V = [number, number, number]

const norm = (v: V): V => {
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
}
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Rodrigues rotation of v around unit axis k by angle (radians). */
function rotate(v: V, k: V, angle: number): V {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const kxv = cross(k, v)
  const kdv = dot(k, v)
  return [0, 1, 2].map((i) => v[i] * c + kxv[i] * s + k[i] * kdv * (1 - c)) as V
}

export interface HandSpec {
  /** Thumb tip to index tip, in palm sizes. */
  pinch?: number
  /** Curl (deg) for index, middle, ring, pinky. */
  curls?: [number, number, number, number]
  /** Translation applied to every landmark. */
  offset?: { x: number; y: number }
  /** Uniform scale (simulates distance from camera). */
  scale?: number
}

const MCP_X = [-0.03, -0.01, 0.01, 0.03]
const SEGMENTS = [0.04, 0.025, 0.02]

export function makeHand({ pinch = 1, curls = [0, 0, 0, 0], offset = { x: 0, y: 0 }, scale = 1 }: HandSpec = {}): Vec3[] {
  const wrist: V = [0, 0, 0]
  const lm: V[] = new Array(21)
  lm[0] = wrist
  for (let f = 0; f < 4; f++) {
    const mcp: V = [MCP_X[f], -0.1, 0]
    const base = 5 + f * 4
    lm[base] = mcp
    const d0 = norm([mcp[0] - wrist[0], mcp[1] - wrist[1], mcp[2] - wrist[2]])
    const axis = norm(cross(d0, [0, 0, 1]))
    const bend = (curls[f] * Math.PI) / 180 / 3
    let dir = d0
    let p = mcp
    for (let s = 0; s < 3; s++) {
      dir = rotate(dir, axis, -bend)
      p = [p[0] + dir[0] * SEGMENTS[s], p[1] + dir[1] * SEGMENTS[s], p[2] + dir[2] * SEGMENTS[s]]
      lm[base + 1 + s] = p
    }
  }
  const palm = Math.hypot(MCP_X[1], 0.1)
  const indexTip = lm[8]
  const thumbTip: V = [indexTip[0] - pinch * palm, indexTip[1], indexTip[2]]
  const cmc: V = [-0.03, -0.03, 0]
  lm[1] = cmc
  for (let i = 1; i <= 3; i++) {
    const t = i / 3
    lm[1 + i] = [cmc[0] + (thumbTip[0] - cmc[0]) * t, cmc[1] + (thumbTip[1] - cmc[1]) * t, cmc[2] + (thumbTip[2] - cmc[2]) * t]
  }
  return lm.map(([x, y, z]) => ({ x: x * scale + offset.x, y: y * scale + offset.y, z: z * scale }))
}

const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  z: a.z + (b.z - a.z) * k,
})

/**
 * A closed "bud": fingers half bent and all five fingertips gathered to one point in
 * front of the palm, like the tips of a flower before it opens.
 */
export function makeBud({ offset = { x: 0, y: 0 }, scale = 1 }: Pick<HandSpec, 'offset' | 'scale'> = {}): Vec3[] {
  const lm = makeHand({ curls: [60, 60, 60, 60], pinch: 0.3 })
  const tips = [8, 12, 16, 20]
  const point = tips.reduce((acc, i) => ({ x: acc.x + lm[i].x / 4, y: acc.y + lm[i].y / 4, z: acc.z + lm[i].z / 4 }), {
    x: 0,
    y: 0,
    z: 0,
  })
  for (const tip of tips) {
    lm[tip] = lerp3(lm[tip], point, 0.85)
    lm[tip - 1] = lerp3(lm[tip - 1], point, 0.45)
  }
  // Thumb reaches the same point; its joints lie on the way there.
  lm[4] = lerp3(lm[4], point, 0.85)
  lm[2] = lerp3(lm[1], lm[4], 1 / 3)
  lm[3] = lerp3(lm[1], lm[4], 2 / 3)
  return lm.map((p) => ({ x: p.x * scale + offset.x, y: p.y * scale + offset.y, z: p.z * scale }))
}

/** In-between of a bud (open = 0) and a fully open hand (open = 1), landmark by landmark. */
export function makeBloom(open: number, spec: Pick<HandSpec, 'offset' | 'scale'> = {}): Vec3[] {
  const bud = makeBud(spec)
  const flat = makeHand({ pinch: 1.1, ...spec })
  return bud.map((p, i) => lerp3(p, flat[i], open))
}
