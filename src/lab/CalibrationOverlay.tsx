import { useEffect, useState } from 'react'
import type { CalibrationProgress } from '../input/calibration'
import { useT, type I18nKey } from '../i18n'
import { useLabServices } from './LabContext'
import { useLab } from './labStore'

const STEP_TEXT: Record<'palms' | 'pinch' | 'fist', [I18nKey, I18nKey]> = {
  palms: ['cal.palms', 'cal.palmsHint'],
  pinch: ['cal.pinch', 'cal.pinchHint'],
  fist: ['cal.fist', 'cal.fistHint'],
}

function HandGlyph({ step }: { step: 'palms' | 'pinch' | 'fist' }) {
  // Simple line-art hands; animated with CSS.
  if (step === 'fist') {
    return (
      <svg viewBox="0 0 64 64" className="cal-glyph">
        <rect x="16" y="22" width="32" height="26" rx="9" />
        <path d="M22 22v-4M30 22v-6M38 22v-5M16 32h-4" />
        <path d="M22 48v8h20v-8" />
      </svg>
    )
  }
  if (step === 'pinch') {
    return (
      <svg viewBox="0 0 64 64" className="cal-glyph cal-glyph--pinch">
        <path d="M24 56V34l-8-10M24 34l10-20M30 34V12M36 34V14M42 34V18" />
        <circle cx="34" cy="14" r="3" className="cal-pinch-dot" />
        <path d="M24 56h18V34" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 64" className="cal-glyph cal-glyph--palms">
      <path d="M12 56V34l-6-10M12 34V12M17 34V9M22 34V11M27 34V16M12 56h15V34" />
      <path d="M52 56V34l6-10M52 34V12M47 34V9M42 34V11M37 34V16M52 56H37V34" />
    </svg>
  )
}

export function CalibrationOverlay() {
  const t = useT()
  const { input } = useLabServices()
  const calibrating = useLab((s) => s.calibrating)
  const set = useLab((s) => s.set)
  const [progress, setProgress] = useState<CalibrationProgress | null>(null)
  const [done, setDone] = useState(false)
  const [handsVisible, setHandsVisible] = useState(true)

  useEffect(
    () =>
      input.onCalibration((p, finished) => {
        setProgress(p)
        if (finished) {
          setDone(true)
          window.setTimeout(() => {
            setDone(false)
            set({ calibrating: null })
          }, 1400)
        }
      }),
    [input, set],
  )

  useEffect(() => {
    if (!calibrating) return
    const id = window.setInterval(() => setHandsVisible(input.latest.hands.length > 0), 300)
    return () => window.clearInterval(id)
  }, [calibrating, input])

  if (!calibrating && !done) return null

  const skip = () => {
    input.cancelCalibration()
    set({ calibrating: null })
  }

  if (done) {
    return (
      <div className="cal-overlay" data-hud>
        <div className="cal-card cal-card--done">
          <span className="hud-tag">{t('cal.title')}</span>
          <h2>{t('cal.done')}</h2>
        </div>
      </div>
    )
  }

  const step = progress?.step && progress.step !== 'done' ? progress.step : 'palms'
  const [title, hint] = STEP_TEXT[step]
  const value = progress?.progress ?? 0
  const circumference = 2 * Math.PI * 46

  return (
    <div className="cal-overlay" data-hud>
      <div className="cal-card">
        <span className="hud-tag">
          {t('cal.title')}
          {calibrating === 'full' && ` · ${['palms', 'pinch', 'fist'].indexOf(step) + 1}/3`}
        </span>
        <div className="cal-ring">
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" className="cal-ring-track" />
            <circle
              cx="50"
              cy="50"
              r="46"
              className="cal-ring-fill"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - value)}
            />
          </svg>
          <HandGlyph step={step} />
        </div>
        <h2>
          {title}
          {step === 'pinch' && progress ? ` · ${progress.pinches}/3` : ''}
        </h2>
        <p>{handsVisible ? t(hint) : t('cal.noHands')}</p>
        <button type="button" className="hud-button" onClick={skip}>
          {t('cal.skip')}
        </button>
      </div>
    </div>
  )
}
