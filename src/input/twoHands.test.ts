import { describe, expect, it } from 'vitest'
import { makeBud, makeHand } from './__fixtures__/hands'
import { classifyPose } from './handGeometry'
import { DEFAULT_TUNING } from './tuning'
import { PalmPush, PinchPair, TWIST_BAND, type PushHand } from './twoHands'
import type { Vec3 } from './types'

const t = DEFAULT_TUNING

describe('PinchPair', () => {
  it('pulling the hands apart gives a ratio above 1, pushing together below 1', () => {
    const pair = new PinchPair({ x: 400, y: 300 }, { x: 600, y: 300 })
    expect(pair.update({ x: 300, y: 300 }, { x: 700, y: 300 }).ratio).toBeCloseTo(396 / 200)
    expect(pair.update({ x: 450, y: 300 }, { x: 550, y: 300 }).ratio).toBeCloseTo(104 / 200)
  })

  it('ignores jitter inside the bands', () => {
    const pair = new PinchPair({ x: 400, y: 300 }, { x: 600, y: 300 })
    for (let i = 0; i < 20; i++) {
      const j = i % 2 ? 1.5 : -1.5
      const { ratio, turn } = pair.update({ x: 400 + j, y: 300 - j }, { x: 600 - j, y: 300 + j })
      expect(ratio).toBe(1)
      expect(turn).toBe(0)
    }
  })

  it('turning both hands like a wheel reports the twist beyond the band', () => {
    const pair = new PinchPair({ x: 400, y: 300 }, { x: 600, y: 300 })
    let total = 0
    for (let deg = 2; deg <= 60; deg += 2) {
      const a = (deg * Math.PI) / 180
      const r = pair.update(
        { x: 500 - 100 * Math.cos(a), y: 300 - 100 * Math.sin(a) },
        { x: 500 + 100 * Math.cos(a), y: 300 + 100 * Math.sin(a) },
      )
      expect(r.ratio).toBeCloseTo(1)
      total += r.turn
    }
    expect(total).toBeCloseTo((60 * Math.PI) / 180 - TWIST_BAND)
  })

  it('handles the twist across ±180°', () => {
    const pair = new PinchPair({ x: 600, y: 301 }, { x: 400, y: 299 })
    const { turn } = pair.update({ x: 600, y: 280 }, { x: 400, y: 320 })
    expect(Math.abs(turn)).toBeLessThan(0.2)
    expect(turn).not.toBe(0)
  })
})

const hand = (id: number, lm: Vec3[], coasting = false): PushHand => ({
  id,
  pose: classifyPose(lm, t),
  coasting,
})
const open = (scale: number, x: number) => makeHand({ pinch: 1.1, scale, offset: { x, y: 0.5 } })

/** Feeds two hands whose scale goes from s0 to s1 over `ms` at 30 fps. */
function push(p: PalmPush, s0: number, s1: number, ms: number, make = open, start = 0) {
  const n = Math.round(ms / 33)
  const out: { progress: number; fired: boolean }[] = []
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n
    out.push(p.update([hand(1, make(s, 0.3)), hand(2, make(s, 0.9))], start + i * 33))
  }
  return out
}

describe('PalmPush', () => {
  it('fires once when both open palms approach the camera quickly', () => {
    const p = new PalmPush()
    const out = push(p, 1, 1.4, 400)
    expect(out.filter((o) => o.fired)).toHaveLength(1)
    expect(out[5].progress).toBeGreaterThan(0)
    expect(out[5].progress).toBeLessThan(1)
    // Cooldown: pushing on right away does not fire again.
    expect(push(p, 1.4, 1.9, 400, open, 420).some((o) => o.fired)).toBe(false)
  })

  it('does not fire for still palms or a slow drift', () => {
    expect(push(new PalmPush(), 1, 1, 2000).some((o) => o.fired)).toBe(false)
    expect(push(new PalmPush(), 1, 1.4, 4000).some((o) => o.fired)).toBe(false)
  })

  it('does not fire with only one open palm', () => {
    const p = new PalmPush()
    let fired = false
    for (let i = 0; i <= 12; i++) {
      const s = 1 + 0.4 * (i / 12)
      fired ||= p.update(
        [hand(1, open(s, 0.3)), hand(2, makeHand({ pinch: 0.2, scale: s, offset: { x: 0.9, y: 0.5 } }))],
        i * 33,
      ).fired
    }
    expect(fired).toBe(false)
  })

  it('does not fire for fists, pinches or buds approaching', () => {
    const shapes = [
      (s: number, x: number) =>
        makeHand({ pinch: 0.4, curls: [200, 200, 200, 200], scale: s, offset: { x, y: 0.5 } }),
      (s: number, x: number) => makeHand({ pinch: 0.2, scale: s, offset: { x, y: 0.5 } }),
      (s: number, x: number) => makeBud({ scale: s, offset: { x, y: 0.5 } }),
    ]
    for (const make of shapes)
      expect(push(new PalmPush(), 1, 1.5, 300, make).some((o) => o.fired)).toBe(false)
  })
})
