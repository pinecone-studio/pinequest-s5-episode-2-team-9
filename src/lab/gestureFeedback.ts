// Canvas drawing for the richer gestures, so users see a gesture being recognised before
// and while it acts: bloom petals and scale readout, the two-hand bar, the palm-push rings.

import type { HandState } from '../input/handInput'
import { LM, type Vec2 } from '../input/types'
import type { Pointer } from '../interaction/pointerHub'

const CYAN = '94, 231, 255'
const VIOLET = '167, 139, 255'
const TIPS = [LM.THUMB_TIP, LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP]
const FONT = '600 12px "JetBrains Mono Variable", monospace'

const percent = (v: number) => `${Math.round(v * 100)}%`

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, rgb: string) {
  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width + 14
  ctx.fillStyle = 'rgba(6, 12, 24, 0.72)'
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - 10, w, 20, 10)
  ctx.fill()
  ctx.fillStyle = `rgba(${rgb}, 1)`
  ctx.fillText(text, x, y + 0.5)
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
}

function arc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  progress: number,
  rgb: string,
  alpha: number,
) {
  ctx.lineWidth = 3
  ctx.strokeStyle = `rgba(${rgb}, ${alpha})`
  ctx.beginPath()
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.min(1, progress) * Math.PI * 2)
  ctx.stroke()
}

/** Five-finger bloom: petals from the fingertip centre while arming, gathering or scaling. */
export function drawBloom(ctx: CanvasRenderingContext2D, hand: HandState, scale: number) {
  const { phase, progress } = hand.bloom
  if (phase !== 'bud' && phase !== 'gathering' && phase !== 'active') return
  if (phase === 'gathering' && progress < 0.35) return
  const tips = TIPS.map((i) => hand.screen[i])
  const c: Vec2 = { x: tips.reduce((s, p) => s + p.x, 0) / 5, y: tips.reduce((s, p) => s + p.y, 0) / 5 }
  const alpha = hand.coasting ? 0.4 : 1

  ctx.lineWidth = 1.5
  ctx.strokeStyle = `rgba(${CYAN}, ${0.6 * alpha})`
  ctx.setLineDash(phase === 'active' ? [] : [3, 4])
  ctx.beginPath()
  for (const p of tips) {
    ctx.moveTo(c.x, c.y)
    ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.setLineDash([])

  if (phase === 'active') {
    const r = Math.max(14, Math.max(...tips.map((p) => Math.hypot(p.x - c.x, p.y - c.y))))
    ctx.shadowColor = `rgba(${CYAN}, 0.9)`
    ctx.shadowBlur = 14
    arc(ctx, c.x, c.y, r, 1, CYAN, 0.9 * alpha)
    ctx.shadowBlur = 0
    label(ctx, `${hand.bloom.mode === 'shrink' ? '−' : '+'} ${percent(scale)}`, c.x, c.y - r - 16, CYAN)
  } else {
    arc(ctx, c.x, c.y, 18, progress, CYAN, 0.8 * alpha)
  }
}

/** Two-hand pinch: a bar between the hands with what it is changing. */
export function drawTwoHands(
  ctx: CanvasRenderingContext2D,
  a: Pointer,
  b: Pointer,
  kind: 'explode' | 'scale' | 'stretch' | 'join',
  value: number,
) {
  if (kind === 'join') {
    // Assembly tether: the dashes close into a glowing line as the magnet pulls (value 0..1).
    ctx.lineWidth = 2 + 2 * value
    ctx.strokeStyle = `rgba(${CYAN}, ${0.35 + 0.6 * value})`
    ctx.shadowColor = `rgba(${CYAN}, 0.9)`
    ctx.shadowBlur = 16 * value
    ctx.setLineDash([6, 6 * (1 - value)])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    return
  }
  ctx.lineWidth = 2
  ctx.strokeStyle = `rgba(${CYAN}, 0.55)`
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.setLineDash([])
  if (kind === 'stretch') return
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  ctx.fillStyle = `rgba(${CYAN}, 0.9)`
  ctx.beginPath()
  ctx.arc(mx, my, 4, 0, Math.PI * 2)
  ctx.fill()
  label(ctx, `${kind === 'scale' ? '⤢' : '✣'} ${percent(value)}`, mx, my - 18, CYAN)
}

/** Palm push: a ring filling on each open palm as both approach the camera. */
export function drawPalmPush(ctx: CanvasRenderingContext2D, hand: HandState, progress: number) {
  const w = hand.screen[LM.WRIST]
  const m = hand.screen[LM.MIDDLE_MCP]
  const r = Math.max(24, Math.hypot(m.x - w.x, m.y - w.y) * 0.75)
  arc(ctx, (w.x + m.x) / 2, (w.y + m.y) / 2, r, progress, VIOLET, 0.9)
}
