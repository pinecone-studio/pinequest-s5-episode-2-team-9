import { describe, expect, it } from 'vitest'
import { solveLeg } from './dogMotion'

const L1 = 0.05
const L2 = 0.056
const fk = (h: number, k: number) => ({ x: -L1 * Math.sin(h) - L2 * Math.sin(h + k), y: -L1 * Math.cos(h) - L2 * Math.cos(h + k) })

describe('robot dog leg IK', () => {
  it('recovers the standing pose', () => {
    const foot = fk(0.75, -1.5)
    const { h, k } = solveLeg(foot.x, foot.y, L1, L2)
    expect(h).toBeCloseTo(0.75, 4)
    expect(k).toBeCloseTo(-1.5, 4)
  })

  it('reaches targets across the stride', () => {
    for (const dx of [-0.016, 0, 0.016]) {
      for (const dy of [0, 0.018]) {
        const base = fk(0.75, -1.5)
        const { h, k } = solveLeg(base.x + dx, base.y + dy, L1, L2)
        const reached = fk(h, k)
        expect(reached.x).toBeCloseTo(base.x + dx, 5)
        expect(reached.y).toBeCloseTo(base.y + dy, 5)
        expect(k).toBeLessThan(0)
      }
    }
  })
})
