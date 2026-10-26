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
            <p className="credits-small">
              {m.sources.map((src, i) => (
                <span key={src.url}>
                  {i > 0 && <br />}
                  <a href={src.url} target="_blank" rel="noreferrer">
                    {src.text}
                  </a>
                </span>
              ))}
            </p>
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
