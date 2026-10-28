// The hand-input pipeline: tracker → stable tracks → gestures (+ calibration).
// Per hand: bloom (five-finger scale) runs before the pinch machine so a bud never pinches.
// Across hands: an open-palm push resets the view.
// Consumers read `latest` every render frame and subscribe to gesture events.

import {
  CalibrationSession,
  DEFAULT_CALIBRATION,
  loadCalibration,
  saveCalibration,
  type Calibration,
  type CalibrationProgress,
} from './calibration'
import { BloomMachine, type BloomEvent, type BloomState } from './bloom'
import { coverMapping, videoToScreen } from './coords'
import { GestureMachine, type GestureEvent, type GestureState } from './gestures'
import type { HandPose } from './handGeometry'
import { HandTracker } from './handTracker'
import { HandTracks } from './handTracks'
import { tuning } from './tuning'
import { PalmPush } from './twoHands'
import { LM, type RawHandFrame, type Vec2, type Vec3 } from './types'

export interface HandState {
  id: number
  handedness: 'Left' | 'Right'
  coasting: boolean
  /** Smoothed landmarks, normalized video coordinates (unmirrored). */
  landmarks: Vec3[]
  /** The same landmarks in screen pixels (mirrored, cover-cropped). */
  screen: Vec2[]
  /** Interaction point in screen pixels: midway between thumb tip and index tip. */
  cursor: Vec2
  pose: HandPose
  gesture: GestureState
  bloom: BloomState
}

export interface HandsSnapshot {
  hands: HandState[]
  time: number
  /** Detection rate over the last second. */
  trackingFps: number
  /** 0..1 while two open palms are being pushed towards the camera. */
  palmPush: number
}

export type InputEvent = GestureEvent | BloomEvent | { type: 'palmPush'; time: number }

export type InputStatus = 'idle' | 'loading' | 'running' | 'error'

type Listener = (snapshot: HandsSnapshot, events: InputEvent[]) => void
type StatusListener = (status: InputStatus) => void
type CalibrationListener = (progress: CalibrationProgress | null, done: Calibration | null) => void

export class HandInput {
  status: InputStatus = 'idle'
  latest: HandsSnapshot = { hands: [], time: 0, trackingFps: 0, palmPush: 0 }
  calibration: Calibration
  /** True when no saved calibration exists yet (first visit). */
  readonly needsCalibration: boolean
  delegate: 'GPU' | 'CPU' = 'GPU'

  private tracker = new HandTracker()
  private tracks = new HandTracks()
  private machines = new Map<number, GestureMachine>()
  private blooms = new Map<number, BloomMachine>()
  private palmPush = new PalmPush()
  private listeners = new Set<Listener>()
  private statusListeners = new Set<StatusListener>()
  private calibrationListeners = new Set<CalibrationListener>()
  private session: CalibrationSession | null = null
  private viewport = { w: 1, h: 1 }
  private frameTimes: number[] = []

  constructor() {
    const saved = loadCalibration()
    this.calibration = saved ?? DEFAULT_CALIBRATION
    this.needsCalibration = saved === null
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.setStatus('loading')
    try {
      await this.tracker.init()
      this.delegate = this.tracker.delegate
      this.tracker.start(video, (frame) => this.onFrame(frame))
      this.setStatus('running')
    } catch (err) {
      console.error('Hand tracking failed to start', err)
      this.setStatus('error')
    }
  }

  stop(): void {
    this.tracker.close()
    this.tracks.reset()
    this.machines.clear()
    this.blooms.clear()
    this.setStatus('idle')
  }

  setViewport(w: number, h: number): void {
    this.viewport = { w, h }
  }

  startCalibration(mode: 'quick' | 'full'): void {
    this.session = new CalibrationSession(mode)
    this.emitCalibration(this.session.progress(), null)
  }

  cancelCalibration(): void {
    this.session = null
    this.emitCalibration(null, null)
  }

  get calibrating(): boolean {
    return this.session !== null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onCalibration(listener: CalibrationListener): () => void {
    this.calibrationListeners.add(listener)
    return () => this.calibrationListeners.delete(listener)
  }

  private onFrame(frame: RawHandFrame): void {
    const t = tuning.get()
    const now = frame.timestamp
    this.frameTimes.push(now)
    while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift()

    const tracks = this.tracks.update(frame, t)
    const mapping = coverMapping(frame.videoWidth, frame.videoHeight, this.viewport.w, this.viewport.h)
    const events: InputEvent[] = []

    const liveIds = new Set(tracks.map((tr) => tr.id))
    for (const [id, machine] of this.machines) {
      if (!liveIds.has(id)) {
        events.push(...machine.lose(now))
        this.machines.delete(id)
      }
    }
    for (const [id, bloom] of this.blooms) {
      if (!liveIds.has(id)) {
        events.push(...bloom.lose(now))
        this.blooms.delete(id)
      }
    }

    const hands: HandState[] = tracks.map((track) => {
      let machine = this.machines.get(track.id)
      if (!machine) {
        machine = new GestureMachine(track.id)
        this.machines.set(track.id, machine)
      }
      let bloom = this.blooms.get(track.id)
      if (!bloom) {
        bloom = new BloomMachine(track.id)
        this.blooms.set(track.id, bloom)
      }
      const bloomed = bloom.update(track, machine.isPinched(), now)
      events.push(...bloomed.events)
      const result = machine.update(track, this.calibration, t, now, bloomed.blocksPinch)
      events.push(...result.events)
      const screen = track.landmarks.map((p) => videoToScreen(p, mapping))
      const thumb = screen[LM.THUMB_TIP]
      const index = screen[LM.INDEX_TIP]
      return {
        id: track.id,
        handedness: track.handedness,
        coasting: track.coasting,
        landmarks: track.landmarks,
        screen,
        cursor: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 },
        pose: track.pose,
        gesture: result.state,
        bloom: bloomed.state,
      }
    })

    const push = this.palmPush.update(tracks, now)
    if (push.fired) events.push({ type: 'palmPush', time: now })

    if (this.session) {
      const done = this.session.update(tracks, now)
      if (done) {
        this.calibration = done
        saveCalibration(done)
        this.session = null
        this.emitCalibration(null, done)
      } else {
        this.emitCalibration(this.session.progress(), null)
      }
    }

    this.latest = { hands, time: now, trackingFps: this.frameTimes.length, palmPush: push.progress }
    // Gestures are silent during calibration so a calibration pinch never grabs anything.
    const delivered = this.session ? events.filter((e) => e.type === 'pinchEnd' || e.type === 'bloomEnd') : events
    this.listeners.forEach((l) => l(this.latest, delivered))
  }

  private setStatus(status: InputStatus) {
    this.status = status
    this.statusListeners.forEach((l) => l(status))
  }

  private emitCalibration(progress: CalibrationProgress | null, done: Calibration | null) {
    this.calibrationListeners.forEach((l) => l(progress, done))
  }
}
