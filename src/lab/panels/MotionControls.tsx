import { useEffect, useRef, useState } from 'react'
import { play } from '../../audio/sfx'
import { useT, type I18nKey } from '../../i18n'
import { dogClock, LEGS } from '../../scene/motion/dogMotion'
import { ecg, heartClock, phaseAt } from '../../scene/motion/heartClock'
import { useModel } from '../modelStore'

/** ECG trace that scrolls with the beating heart. */
function HeartMonitor() {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState(phaseAt(0))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const W = (canvas.width = canvas.clientWidth * 2)
    const H = (canvas.height = canvas.clientHeight * 2)
    const history: number[] = []
    let raf = 0
    let lastPhase = phaseAt(0)
    const draw = () => {
      const v = heartClock.running ? ecg(heartClock.t) : 0
      history.push(v)
      if (history.length > W / 4) history.shift()
      ctx.clearRect(0, 0, W, H)
      ctx.strokeStyle = 'rgba(94, 231, 255, 0.12)'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }
      ctx.strokeStyle = '#4dffc3'
      ctx.lineWidth = 3
      ctx.shadowColor = '#4dffc3'
      ctx.shadowBlur = 8
      ctx.beginPath()
      history.forEach((h, i) => {
        const x = i * 4
        const y = H * 0.68 - h * H * 0.55
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.shadowBlur = 0
      const p = phaseAt(heartClock.t)
      if (p !== lastPhase) {
        lastPhase = p
        setPhase(p)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="heart-monitor">
      <span className="hud-tag">{t(`motion.phase.${phase}` as I18nKey)}</span>
      <canvas ref={canvasRef} />
      <p className="panel-hint">{t(`motion.phaseHint.${phase}` as I18nKey)}</p>
    </div>
  )
}

/** Which legs are lifted (swing) or planted (stance), live. */
function GaitMonitor() {
  const t = useT()
  const [swing, setSwing] = useState({ ...dogClock.swing })
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setSwing((prev) => (LEGS.some((l) => prev[l] !== dogClock.swing[l]) ? { ...dogClock.swing } : prev))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="gait-monitor">
      {LEGS.map((leg) => (
        <span key={leg} data-swing={swing[leg]}>
          <b>{t(`motion.leg.${leg}` as I18nKey)}</b>
          {swing[leg] ? t('motion.swing') : t('motion.stance')}
        </span>
      ))}
    </div>
  )
}

export function MotionControls() {
  const t = useT()
  const { def, running, tempo, gait, set } = useModel()
  if (!def?.motion) return null
  const heart = def.motion === 'heart'
  return (
    <div className="motion-controls">
      <button
        type="button"
        className="hud-button hud-button--wide hud-button--primary"
        data-active={running}
        onClick={() => {
          play('click')
          set({ running: !running, tempo: heart ? (tempo > 30 && tempo <= 180 ? tempo : 72) : tempo > 100 ? 60 : tempo || 60 })
        }}
      >
        {running ? t('motion.stop') : t(`motion.play.${def.motion}` as I18nKey)}
      </button>
      {running && (
        <label className="slider-row">
          <span>
            {heart ? t('motion.bpm') : t('motion.speed')}: {Math.round(tempo)}
            {heart ? '' : '%'}
          </span>
          <input
            type="range"
            min={heart ? 40 : 10}
            max={heart ? 180 : 100}
            step={1}
            value={tempo}
            onChange={(e) => set({ tempo: Number(e.target.value) })}
          />
        </label>
      )}
      {running && heart && <HeartMonitor />}
      {running && def.motion === 'dog' && (
        <>
          <div className="qn-row">
            {(['walk', 'trot'] as const).map((g) => (
              <button key={g} type="button" className="hud-button" data-active={gait === g} onClick={() => set({ gait: g })}>
                {t(`motion.gait.${g}` as I18nKey)}
              </button>
            ))}
          </div>
          <GaitMonitor />
        </>
      )}
      {running && !heart && <p className="panel-hint">{t(`motion.hint.${def.motion}` as I18nKey)}</p>}
    </div>
  )
}
