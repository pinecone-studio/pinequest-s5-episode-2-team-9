import { describe, expect, it } from 'vitest'
import { coverMapping, videoToScreen } from './coords'

describe('videoToScreen', () => {
  it('mirrors x on a viewport with the same aspect ratio', () => {
    const m = coverMapping(1280, 720, 1280, 720)
    expect(videoToScreen({ x: 0, y: 0 }, m)).toEqual({ x: 1280, y: 0 })
    expect(videoToScreen({ x: 0.25, y: 0.5 }, m)).toEqual({ x: 960, y: 360 })
  })

  it('crops the sides when the viewport is narrower than the video', () => {
    // 16:9 video in a 4:3 viewport: height fits, width overflows.
    const m = coverMapping(1280, 720, 960, 720)
    expect(m.drawnWidth).toBe(1280)
    expect(m.offsetX).toBe(-160)
    expect(videoToScreen({ x: 0.5, y: 0.5 }, m)).toEqual({ x: 480, y: 360 })
  })

  it('crops top and bottom when the viewport is wider than the video', () => {
    const m = coverMapping(1280, 720, 1920, 800)
    expect(m.drawnWidth).toBe(1920)
    expect(m.drawnHeight).toBe(1080)
    expect(videoToScreen({ x: 1, y: 0 }, m)).toEqual({ x: 0, y: -140 })
  })
})
