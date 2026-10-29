import { play } from '../../audio/sfx'
import { useT, useTx } from '../../i18n'
import { keys } from '../../models/ModelDefinition'
import { assemblyStage, guideTarget, useModel } from '../modelStore'
import { AskTutor } from './AskTutor'

export function AssemblyPanel() {
  const t = useT()
  const tx = useTx()
  const { def, placed, hintPart, message, guide, hint, set, startAssembly, exitAssembly } = useModel()
  const target = useModel(guideTarget)
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
          {def.motion && (
            // Run what you built: back to the model with its motion playing (the heart beats, blood flows).
            <button
              type="button"
              className="hud-button hud-button--wide hud-button--primary"
              onClick={() => {
                play('open')
                exitAssembly()
                set({ running: true })
              }}
            >
              {t('assembly.runIt')}
            </button>
          )}
        </div>
      ) : (
        <>
          {def.connected ? (
            <GuideCard target={target} />
          ) : (
            <p className="panel-hint">{t('assembly.instructions')}</p>
          )}
          {message?.kind === 'wrong' && (
            <div className="assembly-message assembly-message--wrong" key={message.id}>
              <strong>
                {t('assembly.notYet')}: {partName(message.partId)}
              </strong>
              <p>
                {tx(
                  keys.partHint(
                    def.id,
                    def.parts.find((p) => p.id === message.partId)!,
                  ),
                )}
              </p>
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
        {def.connected && (
          <button
            type="button"
            className="hud-button"
            aria-pressed={guide}
            onClick={() => {
              play('click')
              set({ guide: !guide })
            }}
          >
            {t(guide ? 'assembly.guideOn' : 'assembly.guideOff')}
          </button>
        )}
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

/** What to do now: the stage, the part in focus, what it attaches to and why it matters. */
function GuideCard({ target }: { target: string | null }) {
  const t = useT()
  const tx = useTx()
  const def = useModel((s) => s.def)!
  const placed = useModel((s) => s.placed)
  const stage = assemblyStage(def, placed)
  const stages = def.groups.filter((g) =>
    def.parts.some((p) => p.group === g && !def.baseParts.includes(p.id)),
  )
  const part = def.parts.find((p) => p.id === target)
  const parent = part && def.parts.find((p) => p.id === part.dependsOn[0])
  const message = useModel((s) => s.message)
  // Just tried to fit this part too early: offer to ask why.
  const wrongHere = message?.kind === 'wrong' && message.partId === part?.id

  return (
    <div className="guide-card">
      {stage && (
        <span className="hud-tag">
          {t('assembly.stage')} {stages.indexOf(stage) + 1}/{stages.length} · {tx(keys.group(def.id, stage))}
        </span>
      )}
      {part ? (
        <>
          <strong>
            <i style={{ background: part.color }} />
            {tx(keys.partName(def.id, part))}
          </strong>
          {parent && (
            <span className="guide-card-to">
              {t('assembly.attachesTo')} {tx(keys.partName(def.id, parent))}
            </span>
          )}
          <p>{tx(keys.partLink(def.id, part))}</p>
          <AskTutor
            key={part.id}
            model={def.id}
            part={part.id}
            assembling
            suggestions={[
              ...(wrongHere ? (['ask.q.whyNotYet'] as const) : []),
              def.id === 'heart' ? 'ask.q.whatFlows' : 'ask.q.wherePlug',
              'ask.q.whyHere',
            ]}
          />
        </>
      ) : (
        <p className="panel-hint">{t('assembly.connectedInstructions')}</p>
      )}
    </div>
  )
}
