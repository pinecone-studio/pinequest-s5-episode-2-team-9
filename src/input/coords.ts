// Maps normalized video coordinates to screen pixels for a mirrored video
// drawn with `object-fit: cover`, so cursors line up with the hands on screen.

import type { Vec2 } from './types'

export interface CoverMapping {
  scale: number
  offsetX: number
  offsetY: number
  drawnWidth: number
  drawnHeight: number
}

export function coverMapping(videoW: number, videoH: number, viewW: number, viewH: number): CoverMapping {
  const scale = videoW > 0 && videoH > 0 ? Math.max(viewW / videoW, viewH / videoH) : 1
  const drawnWidth = videoW * scale
  const drawnHeight = videoH * scale
  return { scale, offsetX: (viewW - drawnWidth) / 2, offsetY: (viewH - drawnHeight) / 2, drawnWidth, drawnHeight }
}

/** Normalized (unmirrored) video point → screen pixels on the mirrored, cropped video. */
export function videoToScreen(p: Vec2, m: CoverMapping): Vec2 {
  return { x: m.offsetX + (1 - p.x) * m.drawnWidth, y: m.offsetY + p.y * m.drawnHeight }
}
