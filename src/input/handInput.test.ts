import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeBloom, makeBud, makeHand } from './__fixtures__/hands'
import { DEFAULT_CALIBRATION, type Calibration, type CalibrationProgress } from './calibration'
import { coverMapping, videoToScreen } from './coords'
import { HandInput, type HandsSnapshot, type InputEvent, type InputStatus } from './handInput'
import { DEFAULT_TUNING } from './tuning'
import { LM, type RawHandFrame, type Vec3 } from './types'

// The MediaPipe tracker needs a browser and a camera: the test feeds its frames instead.
const tracker = vi.hoisted(() => ({
  onFrame: null as ((frame: RawHandFrame) => void) | null,
  fail: false,
  delegate: 'CPU' as 'GPU' | 'CPU',
  closed: 0,
}))
vi.mock('./handTracker', () => ({
  HandTracker: class {
    delegate: 'GPU' | 'CPU' = 'GPU'
    async init() {
      if (tracker.fail) throw new Error('no WebGL')
      this.delegate = tracker.delegate
    }
    start(_video: unknown, onFrame: (frame: RawHandFrame) => void) {
      tracker.onFrame = onFrame
    }
    close() {
      tracker.closed++
    }
  },
}))

/** A square video, so the synthetic hands keep their proportions. */
const VIDEO = 720
const FRAME_MS = 33
/** Where the two hands sit in the video (normalized). */
const LEFT = { x: 0.35, y: 0.6 }
const RIGHT = { x: 0.75, y: 0.6 }

const open = (offset = LEFT, scale = 1) => makeHand({ pinch: 1.1, offset, scale })
const pinched = (offset = LEFT) => makeHand({ pinch: 0.2, curls: [60, 60, 60, 60], offset })
const fist = (offset = LEFT) => makeHand({ pinch: 0.2, curls: [200, 200, 200, 200], offset })

let input: HandInput
let time: number
let snapshots: HandsSnapshot[]
let events: InputEvent[]
const types = () => events.map((e) => e.type)

/** Sends one tracker frame with these hands. */
function send(...hands: Vec3[][]) {
  time += FRAME_MS
  tracker.onFrame!({
    hands: hands.map((landmarks, i) => ({ landmarks, handedness: i ? 'Left' : 'Right', score: 1 })),
    timestamp: time,
    videoWidth: VIDEO,
    videoHeight: VIDEO,
  })
}
/** Keeps sending the same hands for `ms`. */
function hold(ms: number, ...hands: Vec3[][]) {
  for (let t = 0; t < ms; t += FRAME_MS) send(...hands)
}
/** Sends hands that change from one shape to another over `ms`. */
function sweep(ms: number, shape: (k: number) => Vec3[][]) {
  const n = Math.round(ms / FRAME_MS)
  for (let i = 0; i <= n; i++) send(...shape(i / n))
}

async function started() {
  const hands = new HandInput()
  await hands.start({} as HTMLVideoElement)
  hands.setViewport(1000, 800)
  return hands
}

beforeEach(async () => {
  tracker.onFrame = null
  tracker.fail = false
  tracker.closed = 0
  time = 0
  snapshots = []
  events = []
  input = await started()
  input.subscribe((s, e) => {
    snapshots.push(s)
    events.push(...e)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('starting and stopping', () => {
  it('reports loading, then running, with the tracker’s delegate', async () => {
    const hands = new HandInput()
    const statuses: InputStatus[] = []
    hands.onStatus((s) => statuses.push(s))
    expect(hands.status).toBe('idle')
    await hands.start({} as HTMLVideoElement)
    expect(statuses).toEqual(['loading', 'running'])
    expect(hands.delegate).toBe('CPU')
  })

  it('reports an error when the tracker cannot start', async () => {
    tracker.fail = true
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hands = new HandInput()
    await hands.start({} as HTMLVideoElement)
    expect(hands.status).toBe('error')
    expect(quiet).toHaveBeenCalled()
    quiet.mockRestore()
  })

  it('closes the tracker and forgets every hand on stop', () => {
    hold(300, pinched())
    expect(types()).toEqual(['pinchStart'])
    const before = snapshots.at(-1)!.hands[0].id
    const statuses: InputStatus[] = []
    input.onStatus((s) => statuses.push(s))
    input.stop()
    expect(tracker.closed).toBe(1)
    expect(statuses).toEqual(['idle'])
    // The same hand comes back as a new one, not mid-pinch, and nothing was released.
    send(pinched())
    const hand = snapshots.at(-1)!.hands[0]
    expect(hand.id).not.toBe(before)
    expect(hand.gesture.pinched).toBe(false)
    expect(types()).toEqual(['pinchStart'])
  })
})

describe('hand snapshots', () => {
  it('describes each tracked hand, with landmarks on the mirrored screen', () => {
    hold(200, open(LEFT), open(RIGHT))
    const { hands, time: at } = snapshots.at(-1)!
    expect(at).toBe(time)
    expect(hands.map((h) => [h.id, h.handedness, h.coasting])).toEqual([
      [1, 'Right', false],
      [2, 'Left', false],
    ])
    const mapping = coverMapping(VIDEO, VIDEO, 1000, 800)
    for (const hand of hands) {
      hand.screen.forEach((p, i) => expect(p).toEqual(videoToScreen(hand.landmarks[i], mapping)))
      // The cursor sits between thumb tip and index tip.
      const [thumb, index] = [hand.screen[LM.THUMB_TIP], hand.screen[LM.INDEX_TIP]]
      expect(hand.cursor).toEqual({ x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 })
    }
    // Mirrored: the hand on the video's left shows on the screen's right.
    expect(hands[0].cursor.x).toBeGreaterThan(hands[1].cursor.x)
    // A steady hand's smoothed landmarks settle on the tracked ones.
    hands[0].landmarks.forEach((p, i) => expect(p.x).toBeCloseTo(open(LEFT)[i].x, 4))
  })

  it('maps to the current viewport', () => {
    input.setViewport(800, 1000)
    send(open())
    const hand = snapshots.at(-1)!.hands[0]
    const mapping = coverMapping(VIDEO, VIDEO, 800, 1000)
    expect(hand.screen[LM.WRIST]).toEqual(videoToScreen(hand.landmarks[LM.WRIST], mapping))
  })

  it('counts tracker frames over the last second', () => {
    hold(400, open())
    expect(snapshots.at(-1)!.trackingFps).toBe(13)
    hold(2000, open())
    // Frames 33 ms apart: the 31 within the last 1000 ms.
    expect(snapshots.at(-1)!.trackingFps).toBe(31)
  })
})

describe('gestures', () => {
  it('pinches once the fingers stay together, and releases when they open', () => {
    hold(300, pinched())
    expect(events).toEqual([{ type: 'pinchStart', handId: 1, time: expect.any(Number) }])
    expect(snapshots.at(-1)!.hands[0].gesture).toMatchObject({ pinched: true, pinchProgress: 1 })
    hold(600, open())
    expect(types()).toEqual(['pinchStart', 'pinchEnd'])
    expect(events[1]).toMatchObject({ handId: 1, cancelled: false })
  })

  it('keeps each hand’s gestures separate', () => {
    hold(300, pinched(LEFT), open(RIGHT))
    hold(300, pinched(LEFT), pinched(RIGHT))
    expect(events.map((e) => [e.type, 'handId' in e ? e.handId : null])).toEqual([
      ['pinchStart', 1],
      ['pinchStart', 2],
    ])
  })

  it('cancels a pinch when the hand leaves the camera, after a short grace', () => {
    hold(300, pinched())
    // Missed detections: the hand coasts on its last state for a moment...
    send()
    expect(snapshots.at(-1)!.hands[0].coasting).toBe(true)
    expect(types()).toEqual(['pinchStart'])
    // ...then it is gone, and the pinch it held is cancelled.
    hold(DEFAULT_TUNING.lostGraceMs + 100)
    expect(snapshots.at(-1)!.hands).toEqual([])
    expect(events.at(-1)).toMatchObject({ type: 'pinchEnd', handId: 1, cancelled: true })
  })

  it('fires a held fist once', () => {
    hold(DEFAULT_TUNING.fistHoldMs + 600, fist())
    expect(types()).toEqual(['fistHold'])
    expect(snapshots.at(-1)!.hands[0].gesture.fistProgress).toBe(1)
  })

  it('scales with a bloom, and never pinches with the bud', () => {
    hold(300, makeBud({ offset: LEFT }))
    expect(types()).toEqual(['bloomStart'])
    sweep(600, (k) => [makeBloom(k, { offset: LEFT })])
    expect(snapshots.at(-1)!.hands[0].bloom.phase).toBe('active')
    expect(snapshots.at(-1)!.hands[0].bloom.factor).toBeGreaterThan(1.1)
    // Held open, it comes to rest (the tracker's smoothing makes this take a little longer).
    hold(1500, makeHand({ pinch: 1.1, offset: LEFT }))
    expect(types()).toEqual(['bloomStart', 'bloomEnd'])
  })

  it('ends a bloom when the hand is lost', () => {
    hold(300, makeBud({ offset: LEFT }))
    hold(DEFAULT_TUNING.lostGraceMs + 100)
    expect(types()).toEqual(['bloomStart', 'bloomEnd'])
  })

  it('resets the view when both open palms push towards the camera', () => {
    hold(300, open(LEFT), open(RIGHT))
    const progress: number[] = []
    sweep(400, (k) => {
      const s = 1 + 0.4 * k
      return [open(LEFT, s), open(RIGHT, s)]
    })
    for (const s of snapshots.slice(-13)) progress.push(s.palmPush)
    expect(types()).toEqual(['palmPush'])
    expect(Math.max(...progress)).toBeGreaterThan(0)
    expect(progress.some((p) => p > 0 && p < 1)).toBe(true)
  })

  it('does not reset for one palm', () => {
    sweep(400, (k) => [open(LEFT, 1 + 0.4 * k), pinched(RIGHT)])
    expect(types()).not.toContain('palmPush')
  })
})

describe('calibration', () => {
  /** A Storage that lives for one test. */
  const storage = () => {
    const data = new Map<string, string>()
    const s = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data,
    }
    vi.stubGlobal('localStorage', s)
    return s
  }
  const watch = (hands: HandInput) => {
    const seen: [CalibrationProgress | null, Calibration | null][] = []
    hands.onCalibration((p, d) => seen.push([p, d]))
    return seen
  }

  it('starts with the defaults on a first visit', () => {
    storage()
    const hands = new HandInput()
    expect(hands.needsCalibration).toBe(true)
    expect(hands.calibration).toEqual(DEFAULT_CALIBRATION)
  })

  it('loads a saved calibration', () => {
    const s = storage()
    const saved = { ...DEFAULT_CALIBRATION, palmSize: 0.2 }
    s.setItem('hologemma.calibration', JSON.stringify(saved))
    const hands = new HandInput()
    expect(hands.needsCalibration).toBe(false)
    expect(hands.calibration).toEqual(saved)
  })

  it('measures both palms, then saves and uses the result', async () => {
    const s = storage()
    const seen = watch(input)
    input.startCalibration('quick')
    expect(input.calibrating).toBe(true)
    expect(seen[0][0]).toMatchObject({ step: 'palms', progress: 0 })
    hold(3000, open(LEFT), open(RIGHT))
    const [last, done] = seen.at(-1)!
    expect(last).toBeNull()
    expect(done).not.toBeNull()
    expect(input.calibrating).toBe(false)
    expect(input.calibration).toBe(done)
    expect(JSON.parse(s.data.get('hologemma.calibration')!)).toEqual(done)
    // Progress was reported along the way, rising.
    const steps = seen.slice(1, -1).map(([p]) => p!.progress)
    expect(steps.length).toBeGreaterThan(5)
    expect(steps.at(-1)).toBeGreaterThan(steps[0])
    // The next visit starts calibrated.
    expect(new HandInput().needsCalibration).toBe(false)
  })

  it('keeps gestures quiet while calibrating, except releases', () => {
    input.startCalibration('full')
    hold(300, pinched())
    hold(DEFAULT_TUNING.fistHoldMs + 600, fist())
    // The pinch (which closed into a fist) still releases, so nothing stays held.
    expect(types()).toEqual(['pinchEnd'])
    input.cancelCalibration()
    hold(600, open())
    hold(300, pinched())
    expect(types().at(-1)).toBe('pinchStart')
  })

  it('reports a cancelled calibration', () => {
    const seen = watch(input)
    input.startCalibration('full')
    input.cancelCalibration()
    expect(input.calibrating).toBe(false)
    expect(seen.at(-1)).toEqual([null, null])
    expect(input.calibration).toEqual(DEFAULT_CALIBRATION)
  })
})

describe('listeners', () => {
  it('stop hearing once unsubscribed', () => {
    const frames = vi.fn()
    const statuses = vi.fn()
    const calibration = vi.fn()
    const offs = [input.subscribe(frames), input.onStatus(statuses), input.onCalibration(calibration)]
    offs.forEach((off) => off())
    send(open())
    input.startCalibration('quick')
    input.stop()
    expect(frames).not.toHaveBeenCalled()
    expect(statuses).not.toHaveBeenCalled()
    expect(calibration).not.toHaveBeenCalled()
  })

  it('keep the latest snapshot for readers polling every frame', () => {
    send(open())
    expect(input.latest).toBe(snapshots.at(-1))
  })
})
