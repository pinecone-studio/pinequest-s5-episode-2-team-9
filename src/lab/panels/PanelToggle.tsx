import { play } from '../../audio/sfx'
import { useT } from '../../i18n'
import { useLab } from '../labStore'

// Tucks the side panel away so the model gets the whole screen, and brings it back.
export function PanelHideButton() {
  const t = useT()
  const set = useLab((s) => s.set)
  return (
    <button
      type="button"
      className="hud-button panel-toggle"
      aria-label={t('panel.hide')}
      title={t('panel.hide')}
      onClick={() => {
        play('click')
        set({ panelHidden: true })
      }}
    >
      ›
    </button>
  )
}

export function PanelReveal() {
  const t = useT()
  const set = useLab((s) => s.set)
  return (
    <button
      type="button"
      className="hud-button panel-reveal"
      data-hud
      onClick={() => {
        play('click')
        set({ panelHidden: false })
      }}
    >
      ‹ {t('panel.show')}
    </button>
  )
}
