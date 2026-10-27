import { play } from '../../audio/sfx'
import { useT, useTx } from '../../i18n'
import { keys } from '../../models/ModelDefinition'
import { useLab } from '../labStore'
import { useModel } from '../modelStore'
import { AssemblyPanel } from './AssemblyPanel'
import { MotionControls } from './MotionControls'
import { StudyCard } from './StudyCard'

// Right-docked HUD: explore controls + parts list, the study card, or assembly.
export function ModelPanel() {
  const t = useT()
  const tx = useTx()
  const { def, mode, explode, cutaway, scale, selected, set, openStudy, startAssembly, resetView } =
    useModel()
  const viewStyle = useLab((s) => s.viewStyle)
  const setLab = useLab((s) => s.set)
  if (!def) return null

  return (
    <aside className="model-panel hud-panel" data-hud>
      <div className="hud-panel-head">
        <span className="hud-tag" style={{ color: def.accent }}>
          {tx(keys.title(def.id))}
        </span>
        <span className="mode-chip">
          {t(mode === 'assembly' ? 'mode.assembly' : mode === 'study' ? 'mode.study' : 'mode.explore')}
        </span>
      </div>

      {!def.realisticOnly && (
        <div className="view-switch" role="group" aria-label={t('view.title')}>
          {(['hologram', 'realistic'] as const).map((style) => (
            <button
              key={style}
              type="button"
              className="hud-button"
              data-active={viewStyle === style}
              onClick={() => {
                play('click')
                setLab({ viewStyle: style })
              }}
            >
              {t(style === 'hologram' ? 'view.hologram' : 'view.realistic')}
            </button>
          ))}
        </div>
      )}

      {mode === 'study' && <StudyCard />}
      {mode === 'assembly' && <AssemblyPanel />}

      {mode === 'explore' && (
        <>
          <MotionControls />
          <label className="slider-row">
            <span>{t('panel.explode')}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explode}
              onChange={(e) => set({ explode: Number(e.target.value) })}
            />
          </label>
          <p className="panel-hint">{t('panel.explodeHint')}</p>

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

          <label className="slider-row">
            <span>{t('panel.zoom')}</span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.01}
              value={scale}
              onChange={(e) => set({ scale: Number(e.target.value) })}
            />
          </label>

          <div className="panel-actions">
            <button
              type="button"
              className="hud-button hud-button--primary"
              onClick={() => {
                play('click')
                startAssembly()
              }}
            >
              {t('panel.startAssembly')}
            </button>
            <button type="button" className="hud-button" onClick={resetView}>
              {t('panel.resetView')}
            </button>
          </div>

          <div className="parts-list">
            <span className="hud-tag">{t('panel.parts')}</span>
            {def.groups.map((g) => (
              <div key={g} className="parts-group">
                <span className="parts-group-name">{tx(keys.group(def.id, g))}</span>
                {def.parts
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="part-button"
                      data-selected={selected === p.id}
                      onClick={() => {
                        play('open')
                        openStudy(p.id)
                      }}
                    >
                      <i style={{ background: p.color }} />
                      {tx(keys.partName(def.id, p))}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <p className="panel-hint">{t('study.howToOpen')}</p>
        </>
      )}
    </aside>
  )
}
