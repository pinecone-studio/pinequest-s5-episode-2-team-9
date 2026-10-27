import { play } from '../../audio/sfx'
import { useT, useTx } from '../../i18n'
import { keys } from '../../models/ModelDefinition'
import { useModel } from '../modelStore'

export function AssemblyPanel() {
  const t = useT()
  const tx = useTx()
  const { def, placed, hintPart, message, hint, startAssembly, exitAssembly } = useModel()
  if (!def) return null
  const total = def.parts.length
  const progress = placed.length / total
  const complete = message?.kind === 'complete' || placed.length === total
  const partName = (id: string) => {
    const p = def.parts.find((x) => x.id === id)
    return p ? tx(keys.partName(def.id, p)) : id
  }

  return (
    <div className="assembly-panel">
      <div className="assembly-progress">
        <span>
          {placed.length}/{total} {t('assembly.progress')}
        </span>
        <div className="progress-bar">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {complete ? (
        <div className="assembly-message assembly-message--complete" key="complete">
          <strong>{t('assembly.complete')}</strong>
          <p>{t('assembly.completeHint')}</p>
        </div>
      ) : (
        <>
          <p className="panel-hint">{t('assembly.instructions')}</p>
          {message?.kind === 'wrong' && (
            <div className="assembly-message assembly-message--wrong" key={message.id}>
              <strong>
                {t('assembly.notYet')}: {partName(message.partId)}
              </strong>
              <p>{tx(keys.partHint(def.id, def.parts.find((p) => p.id === message.partId)!))}</p>
            </div>
          )}
          {message?.kind === 'placed' && (
            <div className="assembly-message assembly-message--placed" key={message.id}>
              <strong>
                {t('assembly.placed')}: {partName(message.partId)}
              </strong>
            </div>
          )}
          {hintPart && (
            <div className="assembly-message">
              <span className="hud-tag">{t('assembly.nextIs')}</span>
              <p>{partName(hintPart)}</p>
            </div>
          )}
          <button
            type="button"
            className="hud-button hud-button--wide hud-button--primary"
            onClick={() => {
              play('click')
              hint()
            }}
          >
            {hintPart ? t('assembly.hintAgain') : t('assembly.hint')}
          </button>
        </>
      )}

      <div className="panel-actions">
        <button
          type="button"
          className="hud-button"
          onClick={() => {
            play('click')
            startAssembly()
          }}
        >
          {t('assembly.restart')}
        </button>
        <button
          type="button"
          className="hud-button"
          onClick={() => {
            play('click')
            exitAssembly()
          }}
        >
          {t('assembly.exit')}
        </button>
      </div>
    </div>
  )
}
