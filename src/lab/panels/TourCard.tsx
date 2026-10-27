import { play } from '../../audio/sfx'
import { useT, useTx } from '../../i18n'
import { keys } from '../../models/ModelDefinition'
import { useModel } from '../modelStore'

// Guided tour narration, shown in the panel in place of the explore controls.
export function TourCard() {
  const t = useT()
  const tx = useTx()
  const { def, tourStep, stepTour, endTour } = useModel()
  const step = def?.tour && tourStep !== null ? def.tour[tourStep] : undefined
  if (!def?.tour || !step || tourStep === null) return null
  const part = step.part ? def.parts.find((p) => p.id === step.part) : undefined
  const last = tourStep === def.tour.length - 1

  return (
    <div className="study-card tour-card" aria-live="polite">
      <span className="study-group" style={{ color: def.accent }}>
        {t('tour.label')} · {tourStep + 1}/{def.tour.length}
      </span>
      <div className="tour-progress" aria-hidden="true">
        <i style={{ width: `${(100 * (tourStep + 1)) / def.tour.length}%`, background: def.accent }} />
      </div>
      <h2>{tx(keys.tourTitle(def.id, step.id))}</h2>
      {part && (
        <span className="tour-part" style={{ borderColor: part.color }}>
          <i style={{ background: part.color }} />
          {tx(keys.partName(def.id, part))}
        </span>
      )}
      <p>{tx(keys.tourText(def.id, step.id))}</p>

      <div className="panel-actions">
        <button
          type="button"
          className="hud-button"
          disabled={tourStep === 0}
          onClick={() => {
            play('click')
            stepTour(-1)
          }}
        >
          ← {t('tour.back')}
        </button>
        <button
          type="button"
          className="hud-button hud-button--primary"
          onClick={() => {
            play(last ? 'success' : 'click')
            stepTour(1)
          }}
        >
          {last ? t('tour.finish') : `${t('tour.next')} →`}
        </button>
      </div>
      <button
        type="button"
        className="hud-button hud-button--wide"
        onClick={() => {
          play('click')
          endTour()
        }}
      >
        {t('tour.exit')}
      </button>
    </div>
  )
}
