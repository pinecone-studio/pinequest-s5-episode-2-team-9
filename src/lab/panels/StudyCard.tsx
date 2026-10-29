import { play } from '../../audio/sfx'
import { useT, useTx } from '../../i18n'
import { keys, piecePath, piecesAt } from '../../models/ModelDefinition'
import { pieceColorAt } from '../../scene/pieceColors'
import { pieceLabel } from '../pieceLabel'
import { useModel } from '../modelStore'
import { AskTutor } from './AskTutor'

export function StudyCard() {
  const t = useT()
  const tx = useTx()
  const { def, studyPart, studyPath, hoveredPiece, pieceSpread, cutaway, set, stepStudy, closePiece, openPiece } = useModel()
  const part = def?.parts.find((p) => p.id === studyPart)
  if (!def || !part) return null
  const chain = piecePath(part, studyPath)
  const piece = chain[chain.length - 1]
  const children = piecesAt(part, studyPath)
  const siblings: { id: string }[] = piece ? piecesAt(part, studyPath.slice(0, -1)) : def.parts
  const index = siblings.findIndex((s) => s.id === (piece ?? part).id)
  const color = pieceColorAt(part.color, part.pieces, studyPath)
  const click = (fn: () => void) => () => {
    play('click')
    fn()
  }

  return (
    <div className="study-card">
      <span className="study-group" style={{ color }}>
        {tx(keys.group(def.id, part.group))} · {index + 1}/{siblings.length}
      </span>
      {chain.length > 0 && (
        <nav className="study-trail" aria-label={t('study.trail')}>
          <button type="button" onClick={click(() => set({ studyPath: [], hoveredPiece: null, pieceSpread: 0.25 }))}>
            {tx(keys.partName(def.id, part))}
          </button>
          {chain.slice(0, -1).map((p, i) => (
            <span key={p.id}>
              ›{' '}
              <button
                type="button"
                onClick={click(() => set({ studyPath: studyPath.slice(0, i + 1), hoveredPiece: null, pieceSpread: 0.25 }))}
              >
                {pieceLabel(tx, def, p)}
              </button>
            </span>
          ))}
        </nav>
      )}
      <h2>{piece ? pieceLabel(tx, def, piece) : tx(keys.partName(def.id, part))}</h2>
      <p>{piece ? tx(keys.pieceDesc(def.id, piece)) : tx(keys.partDesc(def.id, part))}</p>
      {!piece && (
        <div className="study-fact">
          <span className="hud-tag">{t('study.fact')}</span>
          <p>{tx(keys.partFact(def.id, part))}</p>
        </div>
      )}

      {children.length > 0 && (
        <>
          <span className="hud-tag">
            {t('study.pieces')} · {children.length}
          </span>
          <div className="study-pieces">
            {children.map((c, i) => (
              <button
                key={c.id}
                type="button"
                data-hovered={hoveredPiece === c.id}
                onPointerEnter={() => set({ hoveredPiece: c.id })}
                onPointerLeave={() => set({ hoveredPiece: null })}
                onClick={() => {
                  play('open')
                  openPiece(c.id)
                }}
              >
                <i style={{ background: pieceColorAt(part.color, part.pieces, [...studyPath, children[i].id]) }} />
                {pieceLabel(tx, def, c)}
              </button>
            ))}
          </div>
          <label className="slider-row">
            <span>{t('study.spread')}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={pieceSpread}
              onChange={(e) => set({ pieceSpread: Number(e.target.value) })}
            />
          </label>
          <p className="panel-hint">{t('study.piecesHint')}</p>
        </>
      )}

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
        <button type="button" className="hud-button" onClick={click(() => stepStudy(-1))}>
          ← {t('study.prev')}
        </button>
        <button type="button" className="hud-button" onClick={click(() => stepStudy(1))}>
          {t('study.next')} →
        </button>
      </div>
      <button type="button" className="hud-button hud-button--wide" onClick={click(closePiece)}>
        {chain.length ? t('study.up') : t('study.back')}
      </button>
    </div>
  )
}
