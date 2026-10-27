import { describe, expect, it } from 'vitest'
import { makeHand } from './__fixtures__/hands'
import { CalibrationSession, DEFAULT_CALIBRATION, median, thresholdsFromPinch } from './calibration'
import { classifyPose } from './handGeometry'
import type { HandTrack } from './handTracks'
import { DEFAULT_TUNING } from './tuning'

function hand(id: number, spec: Parameters<typeof makeHand>[0]): HandTrack {
  const landmarks = makeHand(spec)
  return { id, landmarks, pose: classifyPose(landmarks, DEFAULT_TUNING), handedness: 'Left', score: 1, lastSeen: 0, coasting: false }
}

describe('thresholdsFromPinch', () => {
  it('derives thresholds close to the reference defaults for a typical hand', () => {
    const { grab, release } = thresholdsFromPinch(0.16, 1.18)
    expect(grab).toBeCloseTo(0.34, 1)
    expect(release).toBeCloseTo(0.59, 1)
    expect(grab).toBeLessThan(release)
  })

  it('falls back to defaults for implausible measurements', () => {
    expect(thresholdsFromPinch(0.5, 0.7)).toEqual({ grab: DEFAULT_CALIBRATION.grab, release: DEFAULT_CALIBRATION.release })
  })
})

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })
})

describe('CalibrationSession', () => {
  it('quick: finishes after both palms are shown long enough', () => {
    const s = new CalibrationSession('quick')
    let result = null
    for (let i = 0; i < 80 && !result; i++) {
      result = s.update([hand(1, { pinch: 1.1 }), hand(2, { pinch: 1.1, offset: { x: 0.4, y: 0 } })], i * 33)
    }
    expect(result).toMatchObject({ kind: 'quick', grab: 0.34, release: 0.6 })
    expect(result!.palmSize).toBeCloseTo(0.1, 2)
  })

  it('quick: one hand is not enough', () => {
    const s = new CalibrationSession('quick')
    for (let i = 0; i < 100; i++) expect(s.update([hand(1, { pinch: 1.1 })], i * 33)).toBeNull()
  })

  it('full: palms → three pinches → fist', () => {
    const s = new CalibrationSession('full')
    let now = 0
    const step = (tracks: HandTrack[]) => s.update(tracks, (now += 33))
    for (let i = 0; i < 60; i++) step([hand(1, { pinch: 1.1 }), hand(2, { pinch: 1.1, offset: { x: 0.4, y: 0 } })])
    expect(s.progress().step).toBe('pinch')
    for (let p = 0; p < 3; p++) {
      for (let i = 0; i < 5; i++) step([hand(1, { pinch: 1.2, curls: [40, 40, 40, 40] })])
      for (let i = 0; i < 5; i++) step([hand(1, { pinch: 0.15, curls: [40, 40, 40, 40] })])
    }
    for (let i = 0; i < 5; i++) step([hand(1, { pinch: 1.2, curls: [40, 40, 40, 40] })])
    expect(s.progress().step).toBe('fist')
    let result = null
    for (let i = 0; i < 40 && !result; i++) result = step([hand(1, { pinch: 0.3, curls: [200, 200, 200, 200] })])
    expect(result).toMatchObject({ kind: 'full' })
    expect(result!.pinchClosed).toBeCloseTo(0.15, 2)
    expect(result!.pinchOpen).toBeCloseTo(1.2, 2)
    expect(result!.grab).toBeLessThan(result!.release)
  })
})
