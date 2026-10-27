import { describe, expect, it } from 'vitest'
import { OneEuroFilter, PointsFilter } from './filters'

const params = { minCutoff: 1, beta: 0.05, dCutoff: 1 }

describe('OneEuroFilter', () => {
  it('passes the first value through', () => {
    expect(new OneEuroFilter(params).filter(0.5, 0)).toBe(0.5)
  })

  it('reduces jitter around a still point', () => {
    const f = new OneEuroFilter(params)
    let maxDeviation = 0
    for (let i = 0; i < 200; i++) {
      const noisy = 0.5 + (i % 2 === 0 ? 0.01 : -0.01)
      const out = f.filter(noisy, i * 33)
      if (i > 20) maxDeviation = Math.max(maxDeviation, Math.abs(out - 0.5))
    }
    expect(maxDeviation).toBeLessThan(0.005)
  })

  it('follows a moving value', () => {
    const f = new OneEuroFilter(params)
    let out = 0
    for (let i = 0; i <= 60; i++) out = f.filter(i / 60, i * 33)
    expect(out).toBeGreaterThan(0.9)
  })
})

describe('PointsFilter', () => {
  it('filters every component of every point', () => {
    const f = new PointsFilter(params)
    const out = f.filter(
      [
        { x: 1, y: 2, z: 3 },
        { x: 4, y: 5, z: 6 },
      ],
      0,
    )
    expect(out).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    ])
  })
})
