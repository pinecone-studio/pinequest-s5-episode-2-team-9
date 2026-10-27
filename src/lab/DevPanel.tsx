import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { DEFAULT_TUNING, tuning, type Tuning } from '../input/tuning'

const FIELDS: { key: keyof Tuning; min: number; max: number; step: number }[] = [
  { key: 'minCutoff', min: 0.1, max: 5, step: 0.1 },
  { key: 'beta', min: 0, max: 40, step: 0.5 },
  { key: 'pinchHoldMs', min: 0, max: 300, step: 10 },
  { key: 'releaseHoldMs', min: 0, max: 300, step: 10 },
  { key: 'lostGraceMs', min: 0, max: 600, step: 20 },
  { key: 'minHandScore', min: 0.3, max: 0.95, step: 0.05 },
  { key: 'fistMinCurl', min: 100, max: 240, step: 5 },
  { key: 'fistHoldMs', min: 300, max: 2500, step: 100 },
  { key: 'dwellMs', min: 200, max: 1500, step: 50 },
  { key: 'explodeNearRadius', min: 0.5, max: 4, step: 0.1 },
  { key: 'explodeGain', min: 0.2, max: 4, step: 0.1 },
  { key: 'cursorLerp', min: 0.05, max: 1, step: 0.05 },
]

// Live tuning of every gesture parameter (toggle with the ` key).
export function DevPanel() {
  const t = useT()
  const [values, setValues] = useState<Tuning>(tuning.get())
  useEffect(() => tuning.subscribe(setValues), [])

  return (
    <div className="dev-panel" data-hud>
      <div className="dev-panel-head">
        <span className="hud-tag">{t('dev.title')}</span>
        <button type="button" className="hud-button" onClick={() => tuning.reset()}>
          {t('dev.reset')}
        </button>
      </div>
      {FIELDS.map(({ key, min, max, step }) => (
        <label key={key} className="dev-row">
          <span>
            {key}
            <b>{values[key]}</b>
            {values[key] !== DEFAULT_TUNING[key] && <i> ({DEFAULT_TUNING[key]})</i>}
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={values[key]}
            onChange={(e) => tuning.set({ [key]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  )
}
