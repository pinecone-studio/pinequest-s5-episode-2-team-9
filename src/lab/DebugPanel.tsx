import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useLabServices } from './LabContext'

interface Readout {
  trackingFps: number
  renderFps: number
  hands: { id: number; phase: string; pinch: number; fist: boolean; open: boolean; pointing: boolean }[]
}

// Text readout for the debug overlay (D): fps, per-hand state, thresholds.
export function DebugPanel() {
  const t = useT()
  const { input } = useLabServices()
  const [readout, setReadout] = useState<Readout>({ trackingFps: 0, renderFps: 0, hands: [] })

  useEffect(() => {
    let frames = 0
    let raf = 0
    const count = () => {
      frames++
      raf = requestAnimationFrame(count)
    }
    raf = requestAnimationFrame(count)
    const id = window.setInterval(() => {
      const snap = input.latest
      setReadout({
        trackingFps: snap.trackingFps,
        renderFps: frames * 4,
        hands: snap.hands.map((h) => ({
          id: h.id,
          phase: h.gesture.phase,
          pinch: h.pose.pinch,
          fist: h.pose.fist,
          open: h.pose.openPalm,
          pointing: h.pose.pointing,
        })),
      })
      frames = 0
    }, 250)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(id)
    }
  }, [input])

  const cal = input.calibration
  return (
    <div className="debug-panel" data-hud>
      <div>
        {t('debug.fps')}: {readout.trackingFps} fps ({input.delegate}) · {t('debug.render')}: {readout.renderFps} fps
      </div>
      <div>
        grab &lt; {cal.grab.toFixed(2)} · release &gt; {cal.release.toFixed(2)} · cal: {cal.kind}
      </div>
      {readout.hands.map((h) => (
        <div key={h.id}>
          #{h.id} {h.phase.padEnd(9)} pinch {h.pinch.toFixed(2)}
          {h.open ? ' · open' : ''}
          {h.fist ? ' · fist' : ''}
          {h.pointing ? ' · point' : ''}
        </div>
      ))}
    </div>
  )
}
