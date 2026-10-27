import { useT } from '../i18n'
import { AccountButton } from '../ui/AccountButton'
import { LangToggle } from '../ui/LangToggle'
import { useLabServices } from './LabContext'
import { useLab } from './labStore'

export function SettingsPanel() {
  const t = useT()
  const { input } = useLabServices()
  const { headParallax, debug, devPanel, tracking, set } = useLab()

  const recalibrate = () => {
    set({ settingsOpen: false, calibrating: 'full' })
    input.startCalibration('full')
  }

  return (
    <div className="settings-panel hud-panel" data-hud role="dialog" aria-label={t('settings.title')}>
      <div className="hud-panel-head">
        <span className="hud-tag">{t('settings.title')}</span>
        <button type="button" className="hud-button" onClick={() => set({ settingsOpen: false })}>
          {t('settings.close')}
        </button>
      </div>

      <button type="button" className="settings-row" onClick={recalibrate} disabled={tracking !== 'running'}>
        <strong>{t('settings.recalibrate')}</strong>
        <span>{t('settings.recalibrateHint')}</span>
      </button>

      <button
        type="button"
        className="settings-row"
        aria-pressed={headParallax}
        onClick={() => set({ headParallax: !headParallax })}
      >
        <strong>
          {t('settings.headParallax')} <em className="switch" data-on={headParallax} />
        </strong>
        <span>{t('settings.headParallaxHint')}</span>
      </button>

      <button type="button" className="settings-row" aria-pressed={debug} onClick={() => set({ debug: !debug })}>
        <strong>
          {t('settings.debug')} <em className="switch" data-on={debug} />
        </strong>
      </button>

      <button type="button" className="settings-row" aria-pressed={devPanel} onClick={() => set({ devPanel: !devPanel })}>
        <strong>
          {t('settings.devPanel')} <em className="switch" data-on={devPanel} />
        </strong>
      </button>

      <button type="button" className="settings-row" onClick={() => set({ settingsOpen: false, creditsOpen: true })}>
        <strong>{t('settings.credits')}</strong>
      </button>

      <div className="settings-row settings-row--static">
        <strong>{t('settings.language')}</strong>
        <LangToggle />
      </div>

      <div className="settings-row settings-row--static">
        <strong>{t('settings.account')}</strong>
        <AccountButton />
      </div>
    </div>
  )
}
