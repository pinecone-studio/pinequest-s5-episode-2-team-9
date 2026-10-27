import { describe, expect, it } from 'vitest'
import { makeHand } from './__fixtures__/hands'
import { DEFAULT_CALIBRATION } from './calibration'
import { classifyPose } from './handGeometry'
import type { HandTrack } from './handTracks'
import { GestureMachine, type GestureEvent } from './gestures'
import { DEFAULT_TUNING } from './tuning'

const t = DEFAULT_TUNING
const cal = DEFAULT_CALIBRATION

function track(pinch: number, opts: { coasting?: boolean; curls?: [number, number, number, number] } = {}): HandTrack {
  const landmarks = makeHand({ pinch, curls: opts.curls ?? [60, 60, 60, 60] })
  return {
    id: 1,
    landmarks,
    pose: classifyPose(landmarks, t),
    handedness: 'Right',
    score: 1,
    lastSeen: 0,
    coasting: opts.coasting ?? false,
  }
}

/** Runs a sequence of pinch ratios at ~30 fps and collects events. */
function run(machine: GestureMachine, ratios: number[], start = 0, step = 33) {
  const events: GestureEvent[] = []
  ratios.forEach((r, i) => events.push(...machine.update(track(r), cal, t, start + i * step).events))
  return events
}

describe('GestureMachine', () => {
  it('starts a pinch only after it is held for pinchHoldMs', () => {
    const m = new GestureMachine(1)
    expect(run(m, [1, 0.2])).toEqual([]) // closed for 0 ms
    const events = run(m, [0.2, 0.2, 0.2], 66)
    expect(events.map((e) => e.type)).toEqual(['pinchStart'])
  })

  it('ignores a single-frame pinch blip', () => {
    const m = new GestureMachine(1)
    expect(run(m, [1, 0.2, 1, 1, 0.2, 1])).toEqual([])
  })

  it('does not release while the ratio wobbles between grab and release (hysteresis)', () => {
    const m = new GestureMachine(1)
    run(m, [0.2, 0.2, 0.2, 0.2])
    const wobble = Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.55 : 0.3))
    expect(run(m, wobble, 200)).toEqual([])
  })

  it('does not release on a single-frame spike above release', () => {
    const m = new GestureMachine(1)
    run(m, [0.2, 0.2, 0.2, 0.2])
    expect(run(m, [0.9, 0.25, 0.25], 200)).toEqual([])
  })

  it('releases after the ratio stays above release for releaseHoldMs', () => {
    const m = new GestureMachine(1)
    run(m, [0.2, 0.2, 0.2, 0.2])
    const events = run(m, [0.9, 0.9, 0.9, 0.9], 200)
    expect(events.map((e) => e.type)).toEqual(['pinchEnd'])
    expect(events[0]).toMatchObject({ cancelled: false })
  })

  it('keeps holding while the hand is coasting (missed detections)', () => {
    const m = new GestureMachine(1)
    run(m, [0.2, 0.2, 0.2, 0.2])
    for (let i = 0; i < 10; i++) {
      const { events, state } = m.update(track(1.2, { coasting: true }), cal, t, 200 + i * 33)
      expect(events).toEqual([])
      expect(state.pinched).toBe(true)
    }
  })

  it('cancels the pinch when the hand is lost for good', () => {
    const m = new GestureMachine(1)
    run(m, [0.2, 0.2, 0.2, 0.2])
    expect(m.lose(500)).toEqual([{ type: 'pinchEnd', handId: 1, time: 500, cancelled: true }])
    expect(m.lose(600)).toEqual([])
  })

  it('a fist never starts a pinch, and a held fist fires fistHold once', () => {
    const m = new GestureMachine(1)
    const events: GestureEvent[] = []
    for (let i = 0; i < 50; i++) {
      events.push(...m.update(track(0.2, { curls: [200, 200, 200, 200] }), cal, t, i * 33).events)
    }
    expect(events.map((e) => e.type)).toEqual(['fistHold'])
  })

  it('reports pinch progress for the cursor ring', () => {
    const m = new GestureMachine(1)
    expect(m.update(track(1), cal, t, 0).state.pinchProgress).toBe(0)
    expect(m.update(track(0.2), cal, t, 33).state.pinchProgress).toBeCloseTo(0.6)
    expect(m.update(track(0.2), cal, t, 150).state.pinchProgress).toBe(1)
  })
  it('releases a pinch that closes into a fist, then counts the fist', () => {
    const m = new GestureMachine(1)
    run(m, [0.2, 0.2, 0.2, 0.2])
    const events: GestureEvent[] = []
    for (let i = 0; i < 50; i++) {
      events.push(...m.update(track(0.15, { curls: [200, 200, 200, 200] }), cal, t, 200 + i * 33).events)
    }
    expect(events.map((e) => e.type)).toEqual(['pinchEnd', 'fistHold'])
  })
})
