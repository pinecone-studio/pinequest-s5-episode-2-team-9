import { play } from '../../audio/sfx'
import { useT, useTx } from '../../i18n'
import { keys } from '../../models/ModelDefinition'
import { useModel } from '../modelStore'
import { AskTutor } from './AskTutor'

export function StudyCard() {
  const t = useT()
  const tx = useTx()
  const { def, studyPart, cutaway, set, stepStudy, closeStudy } = useModel()
  const part = def?.parts.find((p) => p.id === studyPart)
  if (!def || !part) return null
  const index = def.parts.indexOf(part)

  return (
    <div className="study-card">
      <span className="study-group" style={{ color: part.color }}>
        {tx(keys.group(def.id, part.group))} · {index + 1}/{def.parts.length}
      </span>
      <h2>{tx(keys.partName(def.id, part))}</h2>
      <p>{tx(keys.partDesc(def.id, part))}</p>
      <div className="study-fact">
        <span className="hud-tag">{t('study.fact')}</span>
        <p>{tx(keys.partFact(def.id, part))}</p>
      </div>

      <AskTutor key={part.id} model={def.id} part={part.id} />

      {def.cutaway && (
        <label className="slider-row">
          <span>{t('panel.cutaway')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={cutaway}
            onChange={(e) => set({ cutaway: Number(e.target.value) })}
          />
        </label>
      )}

      <div className="panel-actions">
        <button
          type="button"
          className="hud-button"
          onClick={() => {
            play('click')
            stepStudy(-1)
          }}
        >
          ← {t('study.prev')}
        </button>
        <button
          type="button"
          className="hud-button"
          onClick={() => {
            play('click')
            stepStudy(1)
          }}
        >
          {t('study.next')} →
        </button>
      </div>
      <button
        type="button"
        className="hud-button hud-button--wide"
        onClick={() => {
          play('click')
          closeStudy()
        }}
      >
        {t('study.back')}
      </button>
    </div>
  )
}
