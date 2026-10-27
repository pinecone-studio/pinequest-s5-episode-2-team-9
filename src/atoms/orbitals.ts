// Hydrogen-atom orbitals: ψ_nlm = R_nl(r) · Y_lm(θ, φ) in atomic units (a₀ = 1),
// using real spherical harmonics so every orbital has a real sign (phase).

export interface OrbitalQuantumNumbers {
  n: number
  l: number
  m: number
}

function factorial(k: number): number {
  let f = 1
  for (let i = 2; i <= k; i++) f *= i
  return f
}

/** Generalized Laguerre polynomial L_k^α(x) by recurrence. */
export function laguerre(k: number, alpha: number, x: number): number {
  if (k === 0) return 1
  let prev = 1
  let cur = 1 + alpha - x
  for (let i = 1; i < k; i++) {
    const next = ((2 * i + 1 + alpha - x) * cur - (i + alpha) * prev) / (i + 1)
    prev = cur
    cur = next
  }
  return cur
}

/** Normalized radial function R_nl(r). */
export function radial(n: number, l: number, r: number): number {
  const rho = (2 * r) / n
  const norm = Math.sqrt(Math.pow(2 / n, 3) * (factorial(n - l - 1) / (2 * n * factorial(n + l))))
  return norm * Math.exp(-rho / 2) * Math.pow(rho, l) * laguerre(n - l - 1, 2 * l + 1, rho)
}

/** Real spherical harmonic (up to a constant factor per (l, m)), as a function of the unit direction. */
export function angular(l: number, m: number, x: number, y: number, z: number): number {
  switch (l) {
    case 0:
      return 1
    case 1:
      return m === -1 ? y : m === 0 ? z : x
    case 2:
      switch (m) {
        case -2:
          return x * y
        case -1:
          return y * z
        case 0:
          return (3 * z * z - 1) / (2 * Math.sqrt(3))
        case 1:
          return x * z
        default:
          return (x * x - y * y) / 2
      }
    case 3:
      switch (m) {
        case -3:
          return y * (3 * x * x - y * y)
        case -2:
          return x * y * z
        case -1:
          return y * (5 * z * z - 1)
        case 0:
          return z * (5 * z * z - 3)
        case 1:
          return x * (5 * z * z - 1)
        case 2:
          return z * (x * x - y * y)
        default:
          return x * (x * x - 3 * y * y)
      }
    default:
      return 0
  }
}

/** ψ at a point (atomic units). */
export function psi(q: OrbitalQuantumNumbers, x: number, y: number, z: number): number {
  const r = Math.hypot(x, y, z)
  if (r === 0) return q.l === 0 ? radial(q.n, 0, 0) : 0
  return radial(q.n, q.l, r) * angular(q.l, q.m, x / r, y / r, z / r)
}

const SUBSHELL = ['s', 'p', 'd', 'f']
const LABELS: Record<number, Record<number, string>> = {
  0: { 0: '' },
  1: { [-1]: 'y', 0: 'z', 1: 'x' },
  2: { [-2]: 'xy', [-1]: 'yz', 0: 'z²', 1: 'xz', 2: 'x²−y²' },
  3: { [-3]: 'y(3x²−y²)', [-2]: 'xyz', [-1]: 'yz²', 0: 'z³', 1: 'xz²', 2: 'z(x²−y²)', 3: 'x(x²−3y²)' },
}

export function orbitalName({ n, l, m }: OrbitalQuantumNumbers): string {
  return `${n}${SUBSHELL[l]}${LABELS[l][m] ? ` ${LABELS[l][m]}` : ''}`
}

/** Hydrogen energy level in electronvolts. */
export const energyEv = (n: number) => -13.605693 / (n * n)

export function isValid({ n, l, m }: OrbitalQuantumNumbers): boolean {
  return n >= 1 && n <= 4 && l >= 0 && l < n && Math.abs(m) <= l
}

/** Small seeded PRNG so a given orbital always looks the same. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface OrbitalSamples {
  /** xyz triples in units of a₀. */
  positions: Float32Array
  /** +1 / −1 phase of ψ at each point. */
  phase: Int8Array
  /** Radius that contains the cloud (for scaling). */
  extent: number
}

/**
 * Samples points distributed as |ψ|² with a Metropolis random walk.
 * Several walkers start at random radii so separated lobes all get visited.
 */
export function sampleOrbital(q: OrbitalQuantumNumbers, count: number, seed = 1): OrbitalSamples {
  const rand = mulberry32(seed * 7919 + q.n * 101 + q.l * 13 + (q.m + 5))
  const positions = new Float32Array(count * 3)
  const phase = new Int8Array(count)
  const step = 0.6 * q.n
  const span = 2.5 * q.n * q.n + 4
  const walkers = 24
  const perWalker = Math.ceil(count / walkers)
  const thin = 6
  let written = 0
  let extent = 0

  for (let w = 0; w < walkers && written < count; w++) {
    let x = (rand() * 2 - 1) * span * 0.5
    let y = (rand() * 2 - 1) * span * 0.5
    let z = (rand() * 2 - 1) * span * 0.5
    let p = psi(q, x, y, z) ** 2
    for (let i = 0; i < 400 + perWalker * thin && written < count; i++) {
      const nx = x + (rand() * 2 - 1) * step
      const ny = y + (rand() * 2 - 1) * step
      const nz = z + (rand() * 2 - 1) * step
      const np = psi(q, nx, ny, nz) ** 2
      if (np >= p || rand() * p < np) {
        x = nx
        y = ny
        z = nz
        p = np
      }
      if (i >= 400 && i % thin === 0) {
        positions[written * 3] = x
        positions[written * 3 + 1] = y
        positions[written * 3 + 2] = z
        phase[written] = psi(q, x, y, z) >= 0 ? 1 : -1
        extent = Math.max(extent, Math.hypot(x, y, z))
        written++
      }
    }
  }
  return { positions, phase, extent }
}
