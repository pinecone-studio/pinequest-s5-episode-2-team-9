import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { DPR_BY_LEVEL, useQuality, type QualityLevel } from './quality'

const WINDOW_S = 1.5
const LOW_FPS = 42
const HIGH_FPS = 57

// Invisible quality governor: measures frame rate and steps effects/resolution
// down when the laptop struggles, and back up when there is headroom.
export function AutoQuality() {
  const setDpr = useThree((s) => s.setDpr)
  const level = useQuality((s) => s.level)
  const stats = useRef({ time: 0, frames: 0, low: 0, high: 0 })

  useEffect(() => {
    const [min, max] = DPR_BY_LEVEL[level]
    setDpr(Math.min(max, Math.max(min, window.devicePixelRatio || 1)))
  }, [level, setDpr])

  useFrame((_, dt) => {
    const s = stats.current
    s.time += dt
    s.frames++
    if (s.time < WINDOW_S) return
    const fps = s.frames / s.time
    s.time = 0
    s.frames = 0
    const current = useQuality.getState().level
    if (fps < LOW_FPS) {
      s.low++
      s.high = 0
      if (s.low >= 2 && current > 0) {
        useQuality.getState().set((current - 1) as QualityLevel)
        s.low = 0
      }
    } else if (fps > HIGH_FPS) {
      s.high++
      s.low = 0
      if (s.high >= 6 && current < 2) {
        useQuality.getState().set((current + 1) as QualityLevel)
        s.high = 0
      }
    } else {
      s.low = 0
      s.high = 0
    }
  })

  return null
}
