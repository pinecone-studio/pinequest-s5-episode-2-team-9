import { useEffect, useRef, useState } from 'react'
import { play } from '../../audio/sfx'
import { useT, type I18nKey } from '../../i18n'
import { SCENARIOS } from '../../scene/motion/brainMotion'
import { BREATH_DEPTH, breathVolume, lungClock } from '../../scene/motion/lungMotion'
import { motionInfo } from '../../scene/motion/motionInfo'
import { useModel, type BrainScenario } from '../modelStore'

/** A copy of the scene's live motion state, refreshed ten times a second. */
function useMotionInfo() {
  const [info, setInfo] = useState(() => ({ ...motionInfo, values: { ...motionInfo.values } }))
  useEffect(() => {
    const id = window.setInterval(() => setInfo({ ...motionInfo, values: { ...motionInfo.values } }), 100)
    return () => window.clearInterval(id)
  }, [])
  return info
}

function Gauge({ label, value, unit, max, whole }: { label: string; value: number; unit: string; max: number; whole?: boolean }) {
  return (
    <div className="run-gauge">
      <span>{label}</span>
      <b>
        {whole || value >= 100 ? Math.round(value).toLocaleString() : value.toFixed(1)}
        <small> {unit}</small>
      </b>
      {/* The bar shows size only, so negative readings (pressures below the air outside) fill it too. */}
      <i style={{ width: `${Math.min(100, Math.abs(value / max) * 100)}%` }} />
    </div>
  )
}

// Where each part of the circulation sits on the schematic (viewer's left = the body's right).
const MAP_POINTS: Record<string, [number, number]> = {
  venaCava: [38, 128],
  rightAtrium: [104, 92],
  rightVentricle: [104, 126],
  pulmonaryArtery: [62, 52],
  lungs: [150, 22],
  pulmonaryVeins: [238, 52],
  leftAtrium: [196, 92],
  leftVentricle: [196, 126],
  aorta: [256, 152],
  upperBody: [150, 176],
  lowerBody: [150, 176],
  coronary: [150, 109],
}

/** The double loop of the circulation, with the tracer cell moving round it. */
export function CirculationMonitor() {
  const t = useT()
  const info = useMotionInfo()
  const where = info.where || 'venaCava'
  const [x, y] = MAP_POINTS[where] ?? MAP_POINTS.venaCava
  const oxygen = info.values.oxygen ?? 75
  return (
    <div className="run-monitor">
      <span className="hud-tag">{t('circulation.title')}</span>
      <svg className="circ-map" viewBox="0 0 300 196" role="img" aria-label={t('circulation.title')}>
        <defs>
          <marker id="circ-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 10 5 0 10z" fill="currentColor" />
          </marker>
        </defs>
        {/* Lungs and body. */}
        <rect x="96" y="6" width="108" height="32" rx="14" className="circ-organ" />
        <text x="150" y="26" className="circ-text">{t('circulation.map.lungs')}</text>
        <rect x="96" y="160" width="108" height="30" rx="14" className="circ-organ" />
        <text x="150" y="179" className="circ-text">{t('circulation.map.body')}</text>
        {/* The heart: right side (blue) on the left, left side (red) on the right. */}
        <rect x="84" y="76" width="40" height="30" rx="6" className="circ-chamber circ-blue" />
        <rect x="84" y="110" width="40" height="34" rx="6" className="circ-chamber circ-blue" />
        <rect x="176" y="76" width="40" height="30" rx="6" className="circ-chamber circ-red" />
        <rect x="176" y="110" width="40" height="34" rx="6" className="circ-chamber circ-red" />
        <text x="104" y="95" className="circ-text">{t('circulation.map.ra')}</text>
        <text x="104" y="131" className="circ-text">{t('circulation.map.rv')}</text>
        <text x="196" y="95" className="circ-text">{t('circulation.map.la')}</text>
        <text x="196" y="131" className="circ-text">{t('circulation.map.lv')}</text>
        {/* Vessels. */}
        <path d="M100 175 C38 175 30 120 38 100 C44 86 66 88 84 90" className="circ-vessel circ-blue" markerEnd="url(#circ-arrow)" />
        <path d="M96 110 C70 108 52 80 62 52 C70 30 84 24 96 22" className="circ-vessel circ-blue" markerEnd="url(#circ-arrow)" />
        <path d="M204 22 C224 24 240 36 238 56 C236 76 226 88 216 90" className="circ-vessel circ-red" markerEnd="url(#circ-arrow)" />
        <path d="M216 127 C248 126 266 146 254 164 C244 176 226 176 206 175" className="circ-vessel circ-red" markerEnd="url(#circ-arrow)" />
        <circle cx={x} cy={y} r="6" className="circ-tracer" style={{ fill: oxygen > 90 ? '#ff2d48' : oxygen < 80 ? '#3f7dff' : '#b45cff' }} />
      </svg>
      <p className="run-caption">{t(`circulation.where.${where}` as I18nKey)}</p>
      <div className="run-gauges">
        <Gauge label={t('circulation.oxygen')} value={oxygen} unit="%" max={100} whole />
        <Gauge label={t('circulation.laps')} value={info.laps} unit="" max={Math.max(4, info.laps + 1)} whole />
      </div>
      <p className="panel-hint">{t('circulation.legend')}</p>
      <p className="panel-hint">{t('circulation.fact')}</p>
    </div>
  )
}

export function RocketMonitor() {
  const t = useT()
  const info = useMotionInfo()
  const v = info.values
  const stage = info.stage || 'spinup'
  return (
    <div className="run-monitor">
      <span className="hud-tag">{t(`rocket.stage.${stage}` as I18nKey)}</span>
      <p className="run-caption">{t(`rocket.stageText.${stage}` as I18nKey)}</p>
      <div className="run-gauges">
        <Gauge label={t('rocket.gauge.thrust')} value={v.thrust ?? 0} unit="kN" max={650} />
        <Gauge label={t('rocket.gauge.pressure')} value={v.pressure ?? 0} unit="bar" max={70} />
        <Gauge label={t('rocket.gauge.rpm')} value={v.rpm ?? 0} unit="rpm" max={32000} />
        <Gauge label={t('rocket.gauge.exhaust')} value={v.exhaust ?? 0} unit="km/s" max={2.8} />
        <Gauge label={t('rocket.gauge.flame')} value={v.flame ?? 0} unit="°C" max={3400} />
      </div>
      {info.where && info.where !== 'generator' && (
        <>
          <span className="hud-tag">{t('rocket.title')}</span>
          <p className="run-caption">{t(`rocket.where.${info.where}` as I18nKey)}</p>
        </>
      )}
      <p className="panel-hint">{t('rocket.note')}</p>
    </div>
  )
}

export function MotorMonitor() {
  const t = useT()
  const info = useMotionInfo()
  const v = info.values
  return (
    <div className="run-monitor">
      <span className="hud-tag">{t('motor.title')}</span>
      {info.stage && <p className="run-caption">{t(`motor.stage.${info.stage}` as I18nKey)}</p>}
      <div className="run-gauges">
        <Gauge label={t('motor.gauge.volts')} value={v.volts ?? 0} unit="V" max={12} />
        <Gauge label={t('motor.gauge.amps')} value={v.amps ?? 0} unit="A" max={8} />
        <Gauge label={t('motor.gauge.rpm')} value={v.rpm ?? 0} unit="rpm" max={3000} />
        <Gauge label={t('motor.gauge.backEmf')} value={v.backEmf ?? 0} unit="V" max={12} />
      </div>
      <ol className="run-steps">
        <li>{t('motor.explain1')}</li>
        <li>{t('motor.explain2')}</li>
        <li>{t('motor.explain3')}</li>
      </ol>
      <p className="panel-hint">{t('motor.note')}</p>
    </div>
  )
}

export function BrainMonitor() {
  const t = useT()
  const info = useMotionInfo()
  const scenario = useModel((s) => s.brainScenario)
  const set = useModel((s) => s.set)
  const [name, step] = info.stage.split('.')
  const current = name === scenario ? (step === 'done' ? SCENARIOS[scenario].length : Number(step)) : 0
  return (
    <div className="run-monitor">
      <span className="hud-tag">{t('brain.run.title')}</span>
      <div className="qn-row">
        {(['see', 'smell', 'touch'] as BrainScenario[]).map((s) => (
          <button
            key={s}
            type="button"
            className="hud-button"
            data-active={scenario === s}
            onClick={() => {
              play('click')
              set({ brainScenario: s })
            }}
          >
            {t(`brain.run.scenario.${s}` as I18nKey)}
          </button>
        ))}
      </div>
      <ol className="run-steps">
        {SCENARIOS[scenario].map((_, i) => (
          <li key={i} data-state={i < current ? 'done' : i === current ? 'now' : 'next'}>
            {t(`brain.run.${scenario}.${i}` as I18nKey)}
          </li>
        ))}
      </ol>
      {step === 'done' && <p className="run-caption">{t('brain.run.done')}</p>}
    </div>
  )
}

/** Spirogram (lung volume over time, scrolling) and live breathing gauges. */
export function BreathMonitor() {
  const t = useT()
  const info = useMotionInfo()
  const breathDepth = useModel((s) => s.breathDepth)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const v = info.values
  const stage = info.stage || 'pause'

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const W = (canvas.width = canvas.clientWidth * 2)
    const H = (canvas.height = canvas.clientHeight * 2)
    const history: number[] = []
    let raf = 0
    const draw = () => {
      const depth = BREATH_DEPTH[useModel.getState().breathDepth]
      // Plotted against a deep breath's range, so a deep breath visibly towers over a quiet one.
      history.push(lungClock.running ? (breathVolume(lungClock.t) * depth.volume) / BREATH_DEPTH.deep.volume : 0)
      if (history.length > W / 3) history.shift()
      ctx.clearRect(0, 0, W, H)
      ctx.strokeStyle = 'rgba(94, 231, 255, 0.12)'
      ctx.lineWidth = 1
      for (let y = H * 0.12; y < H; y += H * 0.22) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }
      ctx.strokeStyle = '#7ff3ff'
      ctx.lineWidth = 3
      ctx.shadowColor = '#7ff3ff'
      ctx.shadowBlur = 8
      ctx.beginPath()
      history.forEach((h, i) => {
        const x = i * 3
        const y = H * 0.9 - h * H * 0.78
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.shadowBlur = 0
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="run-monitor">
      <span className="hud-tag">{t(`lungs.stage.${stage}` as I18nKey)}</span>
      <canvas ref={canvasRef} className="breath-trace" aria-label={t('lungs.monitor.trace')} />
      <p className="run-caption">{t(`lungs.stageText.${stage}` as I18nKey)}</p>
      <div className="run-gauges">
        <Gauge label={t('lungs.gauge.volume')} value={v.volume ?? 0} unit="mL" max={BREATH_DEPTH[breathDepth].volume} whole />
        <Gauge label={t('lungs.gauge.flow')} value={v.flow ?? 0} unit="L/s" max={breathDepth === 'deep' ? 4 : 0.8} />
        <Gauge label={t('lungs.gauge.diaphragm')} value={v.diaphragm ?? 0} unit="cm" max={BREATH_DEPTH[breathDepth].diaphragm * 100} />
        <Gauge label={t('lungs.gauge.pleural')} value={v.pleural ?? -5} unit="cmH₂O" max={-40} />
        <Gauge label={t('lungs.gauge.alveolar')} value={v.alveolar ?? 0} unit="cmH₂O" max={breathDepth === 'deep' ? 5 : 1.5} />
      </div>
      <p className="panel-hint">{t('lungs.monitor.legend')}</p>
      <p className="panel-hint">{t(`lungs.monitor.fact.${breathDepth}` as I18nKey)}</p>
    </div>
  )
}
