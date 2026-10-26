import { useT, useTx } from '../i18n'
import { keys } from '../models/ModelDefinition'
import { library } from '../models/registry'
import { useLab } from './labStore'

export function CreditsPanel() {
  const t = useT()
  const tx = useTx()
  const set = useLab((s) => s.set)
  return (
    <div className="hud-panel credits-panel" data-hud role="dialog" aria-label={t('credits.title')}>
      <div className="hud-panel-head">
        <span className="hud-tag">{t('credits.title')}</span>
        <button type="button" className="hud-button" onClick={() => set({ creditsOpen: false })}>
          {t('credits.close')}
        </button>
      </div>
      <ul className="credits-list">
        {library.map((m) => (
          <li key={m.id}>
            <strong>{tx(keys.title(m.id))}</strong>
            <p>{tx(keys.credit(m.id))}</p>
            {m.id === 'heart' && (
              <p className="credits-small">
                Browne, K. (2024). 3D Reference Organ for Heart, Male, v1.3.{' '}
                <a href="https://doi.org/10.48539/HBM564.WKNG.249" target="_blank" rel="noreferrer">
                  doi:10.48539/HBM564.WKNG.249
                </a>
                <br />
                Browne, K. &amp; Schlehlein, H. (2024). 3D Reference Organ for Blood Vasculature, Male, v1.3.{' '}
                <a href="https://doi.org/10.48539/HBM473.XTPP.725" target="_blank" rel="noreferrer">
                  doi:10.48539/HBM473.XTPP.725
                </a>
                <br />
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
                  CC BY 4.0
                </a>
              </p>
            )}
            {m.id === 'robotDog' && (
              <p className="credits-small">
                <a href="https://github.com/mangdangroboticsclub/mini_pupper_ros" target="_blank" rel="noreferrer">
                  mangdangroboticsclub/mini_pupper_ros
                </a>{' '}
                ·{' '}
                <a href="/licenses/mini-pupper-apache-2.0.txt" target="_blank" rel="noreferrer">
                  {t('credits.licenseLink')}
                </a>{' '}
                ·{' '}
                <a href="/licenses/mini-pupper-NOTICE.txt" target="_blank" rel="noreferrer">
                  NOTICE
                </a>
              </p>
            )}
          </li>
        ))}
        <li>
          <p>{t('credits.tracking')}</p>
        </li>
        <li>
          <p>{t('credits.fonts')}</p>
        </li>
      </ul>
    </div>
  )
}
