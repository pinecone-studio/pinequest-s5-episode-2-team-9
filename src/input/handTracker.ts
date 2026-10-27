// MediaPipe HandLandmarker wrapper. Runs on every new video frame
// (requestVideoFrameCallback) entirely on-device; frames are never sent anywhere.

import type { HandLandmarker } from '@mediapipe/tasks-vision'
import type { RawHandFrame } from './types'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/hand_landmarker.task'

type FrameCallback = (frame: RawHandFrame) => void

export class HandTracker {
  private landmarker: HandLandmarker | null = null
  private video: HTMLVideoElement | null = null
  private running = false
  private handle: number | null = null
  private lastVideoTime = -1
  private lastTimestamp = 0
  delegate: 'GPU' | 'CPU' = 'GPU'

  async init(): Promise<void> {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    })
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'))
      this.delegate = 'GPU'
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'))
      this.delegate = 'CPU'
    }
  }

  start(video: HTMLVideoElement, onFrame: FrameCallback): void {
    if (!this.landmarker) throw new Error('HandTracker.init() must finish before start()')
    this.video = video
    this.running = true
    const useVideoCallback = 'requestVideoFrameCallback' in HTMLVideoElement.prototype

    const tick = () => {
      if (!this.running || !this.landmarker || !this.video) return
      const v = this.video
      if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = v.currentTime
        // MediaPipe requires strictly increasing timestamps.
        const timestamp = Math.max(performance.now(), this.lastTimestamp + 1)
        this.lastTimestamp = timestamp
        const result = this.landmarker.detectForVideo(v, timestamp)
        onFrame({
          timestamp,
          videoWidth: v.videoWidth,
          videoHeight: v.videoHeight,
          hands: result.landmarks.map((landmarks, i) => {
            const category = result.handedness[i]?.[0]
            return {
              landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
              handedness: category?.categoryName === 'Left' ? 'Left' : 'Right',
              score: category?.score ?? 0,
            }
          }),
        })
      }
      this.handle = useVideoCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick)
    }
    tick()
  }

  stop(): void {
    this.running = false
    if (this.handle !== null && this.video) {
      if ('cancelVideoFrameCallback' in this.video) this.video.cancelVideoFrameCallback(this.handle)
      cancelAnimationFrame(this.handle)
    }
    this.handle = null
  }

  close(): void {
    this.stop()
    this.landmarker?.close()
    this.landmarker = null
  }
}
