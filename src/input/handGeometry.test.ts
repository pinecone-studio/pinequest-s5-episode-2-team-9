import { describe, expect, it } from 'vitest'
import { makeHand } from './__fixtures__/hands'
import { bendDeg, classifyPose, fingerCurls, palmSize, pinchRatio } from './handGeometry'
import { DEFAULT_TUNING } from './tuning'

const t = DEFAULT_TUNING

describe('bendDeg', () => {
  it('is 0 for a straight line and 90 for a right angle', () => {
    expect(bendDeg({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBeCloseTo(0)
    expect(bendDeg({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(90)
  })
})

describe('hand measurements', () => {
  it('pinch ratio is independent of hand distance from the camera', () => {
    const near = makeHand({ pinch: 0.3, scale: 2 })
    const far = makeHand({ pinch: 0.3, scale: 0.5 })
    expect(pinchRatio(near)).toBeCloseTo(0.3, 2)
    expect(pinchRatio(far)).toBeCloseTo(0.3, 2)
    expect(palmSize(near) / palmSize(far)).toBeCloseTo(4)
  })

  it('measures finger curl', () => {
    const curls = fingerCurls(makeHand({ curls: [0, 90, 180, 210] }))
    expect(curls[0]).toBeCloseTo(0, 0)
    expect(curls[1]).toBeCloseTo(90, 0)
    expect(curls[2]).toBeCloseTo(180, 0)
    expect(curls[3]).toBeCloseTo(210, 0)
  })
})

describe('classifyPose', () => {
  it('recognizes an open palm', () => {
    const pose = classifyPose(makeHand({ pinch: 1.1 }), t)
    expect(pose.openPalm).toBe(true)
    expect(pose.fist).toBe(false)
    expect(pose.pointing).toBe(false)
  })

  it('recognizes a fist', () => {
    const pose = classifyPose(makeHand({ pinch: 0.4, curls: [200, 200, 200, 200] }), t)
    expect(pose.fist).toBe(true)
    expect(pose.openPalm).toBe(false)
  })

  it('recognizes pointing', () => {
    const pose = classifyPose(makeHand({ pinch: 0.8, curls: [10, 180, 180, 180] }), t)
    expect(pose.pointing).toBe(true)
    expect(pose.fist).toBe(false)
  })

  it('a pinch with straight fingers is not an open palm', () => {
    expect(classifyPose(makeHand({ pinch: 0.15 }), t).openPalm).toBe(false)
  })
})
