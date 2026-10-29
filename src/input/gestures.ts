// Per-hand gesture state machine:
//   open → pending (pinch closing, waiting pinchHoldMs) → pinched → releasing → open
// Hysteresis (grab < release) plus hold times keep a held part from flickering
// or dropping. A fist never starts a pinch; holding a fist emits "fistHold".
// A five-finger bud is not a pinch either: the bloom recogniser blocks it (see bloom.ts).

import type { Calibration } from './calibration'
import type { HandTrack } from './handTracks'
import type { Tuning } from './tuning'

export type PinchPhase = 'open' | 'pending' | 'pinched' | 'releasing'

export type GestureEvent =
  | { type: 'pinchStart'; handId: number; time: number }
  | { type: 'pinchEnd'; handId: number; time: number; cancelled: boolean }
  | { type: 'fistHold'; handId: number; time: number }

export interface GestureState {
  phase: PinchPhase
  /** True while the hand holds something (pinched or briefly releasing). */
  pinched: boolean
  /** 0..1, drives the cursor's fill ring. */
  pinchProgress: number
  /** 0..1 while a fist is held; 1 fires "fistHold". */
  fistProgress: number
}

/** Index finger curl above which a closed thumb-index gap is a fist, not a pinch. */
const PINCH_MAX_INDEX_CURL = 175

/** A pinch that closes into a fist for this long is released (a fist means "back"). */
const FIST_RELEASES_PINCH_MS = 300

export class GestureMachine {
  readonly handId: number
  private phase: PinchPhase = 'open'
  private since = 0
  private fistSince: number | null = null
  private fistFired = false
  private lastRatio = Infinity
  private fistWhilePinched: number | null = null

  constructor(handId: number) {
    this.handId = handId
  }

  isPinched(): boolean {
    return this.phase === 'pinched' || this.phase === 'releasing'
  }

  /** `blockPinch`: another recogniser (bloom) owns this hand shape, so no new pinch may start. */
  update(
    track: HandTrack,
    cal: Calibration,
    t: Tuning,
    now: number,
    blockPinch = false,
  ): { state: GestureState; events: GestureEvent[] } {
    const events: GestureEvent[] = []
    const { pinch: ratio, fist, openPalm, curls } = track.pose
    this.lastRatio = ratio

    // While coasting (detection briefly lost) freeze everything.
    if (!track.coasting) {
      const canPinch = !blockPinch && !fist && !openPalm && curls[0] < PINCH_MAX_INDEX_CURL
      switch (this.phase) {
        case 'open':
          if (canPinch && ratio < cal.grab) this.go('pending', now)
          break
        case 'pending':
          if (!canPinch || ratio > cal.release) this.go('open', now)
          else if (now - this.since >= t.pinchHoldMs) {
            this.go('pinched', now)
            events.push({ type: 'pinchStart', handId: this.handId, time: now })
          }
          break
        case 'pinched':
          if (ratio > cal.release) this.go('releasing', now)
          else if (fist) {
            this.fistWhilePinched ??= now
            if (now - this.fistWhilePinched >= FIST_RELEASES_PINCH_MS) {
              this.go('open', now)
              events.push({ type: 'pinchEnd', handId: this.handId, time: now, cancelled: false })
            }
          }
          break
        case 'releasing':
          if (ratio <= cal.release) this.go('pinched', now)
          else if (now - this.since >= t.releaseHoldMs) {
            this.go('open', now)
            events.push({ type: 'pinchEnd', handId: this.handId, time: now, cancelled: false })
          }
          break
      }

      if (!fist) this.fistWhilePinched = null
      if (fist && !this.isPinched()) {
        this.fistSince ??= now
        if (!this.fistFired && now - this.fistSince >= t.fistHoldMs) {
          this.fistFired = true
          events.push({ type: 'fistHold', handId: this.handId, time: now })
        }
      } else {
        this.fistSince = null
        this.fistFired = false
      }
    }

    return { state: this.snapshot(cal, t, now), events }
  }

  /** The hand disappeared for good: end any pinch. */
  lose(now: number): GestureEvent[] {
    const wasPinched = this.isPinched()
    this.phase = 'open'
    return wasPinched ? [{ type: 'pinchEnd', handId: this.handId, time: now, cancelled: true }] : []
  }

  private go(phase: PinchPhase, now: number) {
    this.phase = phase
    this.since = now
    this.fistWhilePinched = null
  }

  private snapshot(cal: Calibration, t: Tuning, now: number): GestureState {
    let pinchProgress: number
    if (this.phase === 'pinched' || this.phase === 'releasing') pinchProgress = 1
    else if (this.phase === 'pending') pinchProgress = 0.6 + 0.4 * Math.min(1, (now - this.since) / t.pinchHoldMs)
    else pinchProgress = 0.6 * Math.min(1, Math.max(0, (cal.release - this.lastRatio) / (cal.release - cal.grab)))
    const fistProgress =
      this.fistSince === null ? 0 : this.fistFired ? 1 : Math.min(1, (now - this.fistSince) / t.fistHoldMs)
    return { phase: this.phase, pinched: this.isPinched(), pinchProgress, fistProgress }
  }
}
