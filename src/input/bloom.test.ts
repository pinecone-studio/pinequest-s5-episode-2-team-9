import { describe, expect, it } from 'vitest'
import { makeBloom, makeBud, makeHand } from './__fixtures__/hands'
import { BLOOM_GAIN, BloomMachine, type BloomEvent, type BloomState } from './bloom'
import { DEFAULT_CALIBRATION } from './calibration'
import { GestureMachine, type GestureEvent } from './gestures'
import { classifyPose } from './handGeometry'
import type { HandTrack } from './handTracks'
import { DEFAULT_TUNING } from './tuning'
import type { Vec3 } from './types'

const t = DEFAULT_TUNING
const STEP = 33

const track = (landmarks: Vec3[]): HandTrack => ({
  id: 1,
  landmarks,
  pose: classifyPose(landmarks, t),
  handedness: 'Right',
  score: 1,
  lastSeen: 0,
  coasting: false,
})

/** Runs frames through bloom + pinch machines exactly as HandInput does (bloom first). */
class Rig {
  bloom = new BloomMachine(1)
  pinch = new GestureMachine(1)
  time = 0
  events: (BloomEvent | GestureEvent)[] = []
  states: BloomState[] = []

  feed(frames: Vec3[][]) {
    for (const lm of frames) {
      const tr = track(lm)
      const b = this.bloom.update(tr, this.pinch.isPinched(), this.time)
      const g = this.pinch.update(tr, DEFAULT_CALIBRATION, t, this.time, b.blocksPinch)
      this.events.push(...b.events, ...g.events)
      this.states.push(b.state)
      this.time += STEP
    }
    return this
  }

  hold(lm: Vec3[], ms: number) {
    return this.feed(Array.from({ length: Math.ceil(ms / STEP) }, () => lm))
  }

  /** Moves from openness `from` to `to` over `ms`. */
  sweep(from: number, to: number, ms: number) {
    const n = Math.ceil(ms / STEP)
    return this.feed(Array.from({ length: n + 1 }, (_, i) => makeBloom(from + ((to - from) * i) / n)))
  }

  types() {
    return this.events.map((e) => e.type)
  }

  last() {
    return this.states[this.states.length - 1]
  }
}

const OPEN = makeHand({ pinch: 1.1 })
const FIST = makeHand({ pinch: 0.4, curls: [200, 200, 200, 200] })

describe('hand poses for blooming', () => {
  it('a bud is all five tips together, and is neither a fist, a pinch-ready hand nor an open palm', () => {
    const pose = classifyPose(makeBud(), t)
    expect(pose.bud).toBe(true)
    expect(pose.fist).toBe(false)
    expect(pose.openPalm).toBe(false)
  })

  it('ordinary pinches, open palms and fists are not buds', () => {
    const shapes = [
      makeHand({ pinch: 0.2 }), // OK sign
      makeHand({ pinch: 0.2, curls: [60, 60, 60, 60] }),
      makeHand({ pinch: 0.15, curls: [60, 170, 170, 170] }), // others tucked
      OPEN,
      FIST,
    ]
    for (const lm of shapes) expect(classifyPose(lm, t).bud).toBe(false)
  })

  it('the bud is independent of hand distance from the camera', () => {
    expect(classifyPose(makeBud({ scale: 2.5 }), t).bud).toBe(true)
    expect(classifyPose(makeBud({ scale: 0.4 }), t).bud).toBe(true)
  })
})

describe('BloomMachine: grow', () => {
  it('bud held, then opened, grows continuously with the spread and ends at rest', () => {
    const r = new Rig().hold(makeBud(), 300)
    expect(r.types()).toEqual(['bloomStart'])
    expect(r.events[0]).toMatchObject({ mode: 'grow' })

    r.sweep(0, 1, 600)
    const factors = r.states.slice(-19).map((s) => s.factor)
    for (let i = 1; i < factors.length; i++) expect(factors[i]).toBeGreaterThanOrEqual(factors[i - 1] - 1e-9)
    // Half way the factor is in between, not a step.
    const mid = r.states[r.states.length - 10].factor
    expect(mid).toBeGreaterThan(1.1)
    expect(mid).toBeLessThan(BLOOM_GAIN * 0.95)

    r.hold(OPEN, 800)
    expect(r.types()).toEqual(['bloomStart', 'bloomEnd'])
    expect(r.states[r.states.length - 26].factor).toBeCloseTo(BLOOM_GAIN, 1)
    expect(r.last().factor).toBe(1) // inactive again
  })

  it('closing again during a bloom brings the factor back down', () => {
    const r = new Rig().hold(makeBud(), 300).sweep(0, 1, 400).sweep(1, 0.3, 300)
    expect(r.last().phase).toBe('active')
    expect(r.last().factor).toBeLessThan(1.6)
    expect(r.last().factor).toBeGreaterThan(1)
  })

  it('a bud never starts a pinch', () => {
    const r = new Rig().hold(makeBud(), 2000)
    expect(r.types().filter((x) => x.startsWith('pinch'))).toEqual([])
  })

  it('after a bloom ends open, closing to a bud and opening grows again (no shrink in between)', () => {
    const r = new Rig().hold(makeBud(), 300).sweep(0, 1, 400).hold(OPEN, 700)
    r.sweep(1, 0, 300).hold(makeBud(), 300).sweep(0, 1, 400).hold(OPEN, 700)
    const starts = r.events.filter((e) => e.type === 'bloomStart')
    expect(starts.map((e) => (e as { mode: string }).mode)).toEqual(['grow', 'grow'])
  })
})

describe('BloomMachine: shrink', () => {
  it('open palm held, then gathered into a bud, shrinks; holding the bud keeps it', () => {
    const r = new Rig().hold(OPEN, 500).sweep(1, 0, 350)
    expect(r.types()).toEqual(['bloomStart'])
    expect(r.events[0]).toMatchObject({ mode: 'shrink' })
    r.hold(makeBud(), 900)
    expect(r.states[r.states.length - 20].factor).toBeCloseTo(1 / BLOOM_GAIN, 1)
    expect(r.types()).toEqual(['bloomStart', 'bloomEnd'])
  })

  it('a gather that is too slow does nothing', () => {
    const r = new Rig().hold(OPEN, 500).sweep(1, 0.3, 300).hold(makeBloom(0.3), 900).sweep(0.3, 0, 100)
    expect(r.types().filter((x) => x.startsWith('bloom'))).toEqual([])
  })
})

describe('BloomMachine: must not fire', () => {
  const never = (r: Rig) => expect(r.types().filter((x) => x.startsWith('bloom'))).toEqual([])

  it('on a plain open palm', () => {
    never(new Rig().hold(OPEN, 3000))
  })

  it('on a fist', () => {
    const r = new Rig().hold(FIST, 2000)
    never(r)
    expect(r.types()).toEqual(['fistHold'])
  })

  it('on a normal pinch, which still grabs', () => {
    const r = new Rig()
      .hold(makeHand({ pinch: 1 }), 200)
      .hold(makeHand({ pinch: 0.2, curls: [60, 60, 60, 60] }), 500)
    never(r)
    expect(r.types()).toEqual(['pinchStart'])
  })

  it('on an open palm closing into a pinch (the usual way to grab)', () => {
    const r = new Rig().hold(OPEN, 600)
    for (const k of [0.8, 0.6, 0.4, 0.2])
      r.feed([makeHand({ pinch: k + 0.1, curls: [60 * (1 - k), 60 * (1 - k), 60 * (1 - k), 60 * (1 - k)] })])
    r.hold(makeHand({ pinch: 0.2, curls: [60, 60, 60, 60] }), 400)
    never(r)
    expect(r.types()).toEqual(['pinchStart'])
  })

  it('on an open palm closing into a pinch with the other fingers tucked', () => {
    const r = new Rig().hold(OPEN, 600).hold(makeHand({ pinch: 0.15, curls: [60, 170, 170, 170] }), 400)
    never(r)
    expect(r.types()).toEqual(['pinchStart'])
  })

  it('on a bud formed while already holding a pinch', () => {
    const r = new Rig().hold(makeHand({ pinch: 0.2, curls: [60, 60, 60, 60] }), 300).hold(makeBud(), 1000)
    never(r)
  })

  it('on a bud shown only briefly', () => {
    never(new Rig().hold(OPEN, 200).hold(makeBud(), 120).sweep(0, 1, 300).hold(OPEN, 500))
  })
})
