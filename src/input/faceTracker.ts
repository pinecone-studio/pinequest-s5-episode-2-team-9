// Head position from MediaPipe FaceLandmarker, for head-coupled parallax.
// Only the position of the eyes is used; runs on-device like the hand tracker.

import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { OneEuroFilter } from './filters'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/face_landmarker.task'

// Outer eye corners (MediaPipe face mesh indices).
const LEFT_EYE = 33
const RIGHT_EYE = 263

export interface HeadPose {
  /** Mirrored, normalized: 0 = left edge of the screen, 1 = right edge. */
  x: number
  /** 0 = top, 1 = bottom. */
  y: number
  /** Inter-eye distance in normalized video width: larger = closer. */
  size: number
  visible: boolean
}

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null
  private running = false
  private handle: number | null = null
  private video: HTMLVideoElement | null = null
  private lastVideoTime = -1
  private lastTimestamp = 0
  private frame = 0
  private filters = [0, 1, 2].map(() => new OneEuroFilter({ minCutoff: 0.6, beta: 4, dCutoff: 1 }))
  latest: HeadPose = { x: 0.5, y: 0.5, size: 0.15, visible: false }

  async start(video: HTMLVideoElement): Promise<void> {
    if (!this.landmarker) {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
      const options = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'VIDEO' as const,
        numFaces: 1,
      })
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, options('GPU'))
      } catch {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, options('CPU'))
      }
    }
    this.video = video
    this.running = true
    const useVideoCallback = 'requestVideoFrameCallback' in HTMLVideoElement.prototype
    const tick = () => {
      if (!this.running || !this.landmarker || !this.video) return
      const v = this.video
      // Every second video frame is plenty for a smoothed head position.
      if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime && this.frame++ % 2 === 0) {
        this.lastVideoTime = v.currentTime
        const timestamp = Math.max(performance.now(), this.lastTimestamp + 1)
        this.lastTimestamp = timestamp
        const face = this.landmarker.detectForVideo(v, timestamp).faceLandmarks[0]
        if (face) {
          const a = face[LEFT_EYE]
          const b = face[RIGHT_EYE]
          const aspect = v.videoWidth / Math.max(1, v.videoHeight)
          this.latest = {
            x: this.filters[0].filter(1 - (a.x + b.x) / 2, timestamp),
            y: this.filters[1].filter((a.y + b.y) / 2, timestamp),
            size: this.filters[2].filter(Math.hypot((a.x - b.x) * aspect, a.y - b.y), timestamp),
            visible: true,
          }
        } else {
          this.latest = { ...this.latest, visible: false }
        }
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
    this.latest = { ...this.latest, visible: false }
  }

  close(): void {
    this.stop()
    this.landmarker?.close()
    this.landmarker = null
  }
}
