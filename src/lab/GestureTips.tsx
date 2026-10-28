import { useT, type I18nKey } from '../i18n'
import { useLab } from './labStore'

const TIPS: [string, I18nKey, I18nKey][] = [
  ['☝', 'tips.point', 'tips.pointText'],
  ['🤏', 'tips.pinch', 'tips.pinchText'],
  ['↔', 'tips.pull', 'tips.pullText'],
  ['⟳', 'tips.twist', 'tips.twistText'],
  ['✋', 'tips.grab', 'tips.grabText'],
  ['⁑', 'tips.double', 'tips.doubleText'],
  ['◔', 'tips.dwell', 'tips.dwellText'],
  ['✊', 'tips.fist', 'tips.fistText'],
]

export function GestureTips() {
  const t = useT()
  const set = useLab((s) => s.set)
  return (
    <div className="tips-overlay" data-hud>
      <div className="tips-card" role="dialog" aria-label={t('tips.title')}>
        <span className="hud-tag">{t('tips.title')}</span>
        <ul>
          {TIPS.map(([icon, title, text]) => (
            <li key={title}>
              <span className="tips-icon" aria-hidden="true">
                {icon}
              </span>
              <div>
                <strong>{t(title)}</strong>
                <p>{t(text)}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="tips-mouse">{t('tips.mouse')}</p>
        <button type="button" className="hud-button hud-button--wide hud-button--primary" onClick={() => set({ tipsOpen: false })}>
          {t('tips.close')}
        </button>
      </div>
    </div>
  )
}
