// One-hand "bloom" scaling, per hand:
//   grow:   all five fingertips gathered into a bud, held → open the hand like a flower
//   shrink: open hand held still → gather all five fingertips into a bud
// While a bloom is active the scale factor follows the fingertip spread continuously
// (closing again undoes, opening again redoes). It ends when the hand rests, makes a fist,
// starts a real pinch or is lost; the reached scale is kept.
//
// Why it cannot misfire on ordinary gestures:
// - A bud needs ALL five fingertips at one point with the fingers reaching forward. A normal
//   pinch leaves the other three fingers elsewhere (open or tucked), a fist tucks them all.
// - Growing needs the bud held for BUD_HOLD_MS first; simply opening the hand does nothing.
// - Shrinking only starts once a true bud is reached after a held open palm, so an open
//   palm that closes into a pinch (the usual way to grab) changes nothing.
// - After a bloom ends, the same pose cannot start another until the hand has left it.

import { BUD_LOOSE_SPREAD, BUD_MIN_REACH } from './handGeometry'
import type { HandTrack } from './handTracks'

export type BloomPhase = 'idle' | 'bud' | 'open' | 'primed' | 'gathering' | 'active'

export type BloomEvent =
  | { type: 'bloomStart'; handId: number; time: number; mode: 'grow' | 'shrink' }
  | { type: 'bloomEnd'; handId: number; time: number }

export interface BloomState {
  phase: BloomPhase
  mode: 'grow' | 'shrink' | null
  /** 0 = bud … 1 = open hand (smoothed). */
  openness: number
  /** Scale multiplier relative to the scale when the bloom started; 1 when not active. */
  factor: number
  /** 0..1 arming feedback (bud hold, or how far a gather has closed). */
  progress: number
}

/** Fingertip spread (palm sizes) treated as fully closed / fully open. */
export const BLOOM_CLOSED_SPREAD = 0.3
export const BLOOM_OPEN_SPREAD = 1.5
/** A full bloom multiplies the scale by this; a full gather divides by it. */
export const BLOOM_GAIN = 2.2
/** Hold a bud this long before opening it grows the model. */
export const BUD_HOLD_MS = 200
/** Hold an open palm this long before gathering it shrinks the model. */
export const OPEN_PRIME_MS = 350
/** A gather must reach a bud within this time after leaving the open palm. */
export const GATHER_MAX_MS = 700
/** Openness changes smaller than this count as resting. */
const REST_BAND = 0.06
/** Resting this long ends an active bloom and keeps the scale. */
export const REST_MS = 500
/** An armed bloom that never moves ends after this long. */
const IDLE_TIMEOUT_MS = 3000
/** Openness smoothing time constant (landmarks are already filtered; this calms the scale). */
const SMOOTH_MS = 70

export const opennessOf = (spread: number) =>
  Math.min(1, Math.max(0, (spread - BLOOM_CLOSED_SPREAD) / (BLOOM_OPEN_SPREAD - BLOOM_CLOSED_SPREAD)))

export class BloomMachine {
  readonly handId: number
  private phase: BloomPhase = 'idle'
  private mode: 'grow' | 'shrink' | null = null
  private since = 0
  private openness: number | null = null
  private lastTime = 0
  /** Openness at which factor = 1. */
  private ref = 0
  private anchor = 0
  private anchorTime = 0
  private moved = false
  /** The pose a bloom ended in; that pose cannot start another until the hand leaves it. */
  private latch: 'bud' | 'open' | null = null

  constructor(handId: number) {
    this.handId = handId
  }

  get active(): boolean {
    return this.phase === 'active'
  }

  /**
   * `pinched`: the pinch machine currently holds a pinch (blooms never start then).
   * Returns the state, events, and whether the pinch machine must not start a pinch this frame.
   */
  update(
    track: HandTrack,
    pinched: boolean,
    now: number,
  ): { state: BloomState; events: BloomEvent[]; blocksPinch: boolean } {
    const events: BloomEvent[] = []
    const { spread, reach, bud, openPalm, fist } = track.pose
    const o = this.smooth(opennessOf(spread), now)

    if (!track.coasting) {
      if (this.latch === 'bud' && !bud) this.latch = null
      if (this.latch === 'open' && !openPalm) this.latch = null

      if (this.phase !== 'active' && (pinched || fist)) this.go('idle', now)

      switch (this.phase) {
        case 'idle':
          if (pinched || fist) break
          if (bud && this.latch !== 'bud') this.go('bud', now)
          else if (openPalm && this.latch !== 'open') this.go('open', now)
          break
        case 'bud':
          if (!bud) this.go('idle', now)
          else if (now - this.since >= BUD_HOLD_MS) this.start('grow', o, now, events)
          break
        case 'open':
          if (!openPalm) this.go('idle', now)
          else if (now - this.since >= OPEN_PRIME_MS) this.go('primed', now)
          break
        case 'primed':
          if (!openPalm) this.go('gathering', now)
          break
        case 'gathering':
          if (bud) this.start('shrink', o, now, events)
          else if (openPalm) this.go('primed', now)
          else if (now - this.since > GATHER_MAX_MS) this.go('idle', now)
          break
        case 'active':
          if (fist || pinched) {
            this.end(now, events, null)
          } else if (Math.abs(o - this.anchor) > REST_BAND) {
            this.anchor = o
            this.anchorTime = now
            this.moved = true
          } else if (this.moved ? now - this.anchorTime >= REST_MS : now - this.since >= IDLE_TIMEOUT_MS) {
            this.end(now, events, bud ? 'bud' : openPalm ? 'open' : null)
          }
          break
      }
    }

    const loose = spread < BUD_LOOSE_SPREAD && reach > BUD_MIN_REACH
    const blocksPinch =
      bud || ((this.phase === 'active' || this.phase === 'gathering' || this.phase === 'bud') && loose)
    return { state: this.snapshot(o, now), events, blocksPinch }
  }

  /** The hand disappeared: an active bloom ends where it is. */
  lose(now: number): BloomEvent[] {
    const events: BloomEvent[] = []
    if (this.phase === 'active') this.end(now, events, null)
    this.phase = 'idle'
    this.openness = null
    return events
  }

  private start(mode: 'grow' | 'shrink', o: number, now: number, events: BloomEvent[]) {
    this.go('active', now)
    this.mode = mode
    // Grow: the bud is the reference (opening multiplies). Shrink: the open hand is (closing divides).
    this.ref = mode === 'grow' ? o : 1
    this.anchor = o
    this.anchorTime = now
    this.moved = mode === 'shrink'
    events.push({ type: 'bloomStart', handId: this.handId, time: now, mode })
  }

  private end(now: number, events: BloomEvent[], latch: 'bud' | 'open' | null) {
    this.go('idle', now)
    this.mode = null
    this.latch = latch
    events.push({ type: 'bloomEnd', handId: this.handId, time: now })
  }

  private go(phase: BloomPhase, now: number) {
    this.phase = phase
    this.since = now
  }

  private smooth(target: number, now: number): number {
    if (this.openness === null) {
      this.openness = target
    } else {
      const dt = Math.max(0, now - this.lastTime)
      this.openness += (target - this.openness) * (1 - Math.exp(-dt / SMOOTH_MS))
    }
    this.lastTime = now
    return this.openness
  }

  private snapshot(o: number, now: number): BloomState {
    let progress = 0
    if (this.phase === 'bud') progress = Math.min(1, (now - this.since) / BUD_HOLD_MS)
    else if (this.phase === 'gathering') progress = 1 - o
    else if (this.phase === 'active') progress = 1
    return {
      phase: this.phase,
      mode: this.mode,
      openness: o,
      factor: this.phase === 'active' ? Math.pow(BLOOM_GAIN, o - this.ref) : 1,
      progress,
    }
  }
}
