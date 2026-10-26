import { useEffect, useRef } from 'react'
import { HAND_CONNECTIONS, LM } from '../input/types'
import { useLabServices } from './LabContext'
import { useLab } from './labStore'

const CYAN = '94, 231, 255'
const VIOLET = '167, 139, 255'

// 2D overlay: fingertip markers and a cursor ring that fills as a pinch registers,
// so users always see what the system sees. Debug mode adds the full skeleton.
export function HandLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { input, hub } = useLabServices()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      const debug = useLab.getState().debug
      const snapshot = input.latest

      for (const hand of snapshot.hands) {
        const alpha = hand.coasting ? 0.35 : 1
        const pts = hand.screen
        if (debug) {
          ctx.lineWidth = 1.5
          ctx.strokeStyle = `rgba(${CYAN}, ${0.55 * alpha})`
          ctx.beginPath()
          for (const [a, b] of HAND_CONNECTIONS) {
            ctx.moveTo(pts[a].x, pts[a].y)
            ctx.lineTo(pts[b].x, pts[b].y)
          }
          ctx.stroke()
          ctx.fillStyle = `rgba(${CYAN}, ${0.9 * alpha})`
          for (const p of pts) {
            ctx.beginPath()
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
            ctx.fill()
          }
          const w = pts[LM.WRIST]
          ctx.font = '600 12px "JetBrains Mono Variable", monospace'
          ctx.fillText(
            `#${hand.id} ${hand.gesture.phase} pinch ${hand.pose.pinch.toFixed(2)} / ${input.calibration.grab.toFixed(2)}–${input.calibration.release.toFixed(2)}`,
            w.x + 10,
            w.y + 18,
          )
        } else {
          // Small glowing markers on thumb and index tips.
          for (const i of [LM.THUMB_TIP, LM.INDEX_TIP]) {
            ctx.beginPath()
            ctx.arc(pts[i].x, pts[i].y, 4, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${CYAN}, ${0.75 * alpha})`
            ctx.shadowColor = `rgba(${CYAN}, 0.9)`
            ctx.shadowBlur = 10
            ctx.fill()
          }
          ctx.shadowBlur = 0
        }
      }

      for (const p of hub.pointers.values()) {
        if (p.kind !== 'hand') continue
        const alpha = p.coasting ? 0.4 : 1
        const r = 16
        ctx.lineWidth = 2
        ctx.strokeStyle = `rgba(${CYAN}, ${0.3 * alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.stroke()
        if (p.progress > 0) {
          ctx.strokeStyle = `rgba(${CYAN}, ${alpha})`
          ctx.lineWidth = 3
          ctx.shadowColor = `rgba(${CYAN}, 0.9)`
          ctx.shadowBlur = p.pressed ? 18 : 8
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + p.progress * Math.PI * 2)
          ctx.stroke()
          ctx.shadowBlur = 0
        }
        if (p.pressed) {
          ctx.fillStyle = `rgba(${CYAN}, ${0.85 * alpha})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
          ctx.fill()
        }
        if (p.fist > 0) {
          ctx.strokeStyle = `rgba(${VIOLET}, ${alpha})`
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 7, -Math.PI / 2, -Math.PI / 2 + p.fist * Math.PI * 2)
          ctx.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [input, hub])

  return <canvas ref={canvasRef} className="hand-layer" aria-hidden="true" />
}
