import { useEffect, useRef, useState } from 'react'
import { isTutorModel } from '../../../api/_lib/tutor/knowledge'
import { play } from '../../audio/sfx'
import { useLang, useT, type I18nKey } from '../../i18n'
import type { ModelId } from '../../models/ModelDefinition'
import { event } from '../../analytics'
import { askTutor, TutorError, type TutorTurn } from '../tutor/tutorApi'

const SUGGESTIONS: Partial<Record<ModelId, I18nKey[]>> = {
  heart: ['ask.q.what', 'ask.q.heartConnect', 'ask.q.heartDisease'],
  computer: ['ask.q.what', 'ask.q.computerPort', 'ask.q.computerConnect'],
}

/**
 * "Ask Hologemma": questions about one part, answered by the fine-tuned tutor. In the study card it
 * is about the open part; in the assembly guide (`assembling`) about the part being fitted, with
 * its own suggested questions.
 */
export function AskTutor({
  model,
  part,
  assembling = false,
  suggestions,
}: {
  model: ModelId
  part: string
  assembling?: boolean
  suggestions?: I18nKey[]
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [turns, setTurns] = useState<TutorTurn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<I18nKey | null>(null)
  const abort = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: 'nearest' })
  }, [turns])

  if (!isTutorModel(model)) return null

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    play('click')
    event('ask_question', { model, part })
    const history: TutorTurn[] = [...turns, { role: 'user', content: text }]
    setTurns([...history, { role: 'assistant', content: '' }])
    setDraft('')
    setError(null)
    setBusy(true)
    abort.current = new AbortController()
    try {
      await askTutor(
        { model, part, lang, messages: history, assembling },
        (answer) => setTurns([...history, { role: 'assistant', content: answer }]),
        abort.current.signal,
      )
    } catch (e) {
      if (abort.current.signal.aborted) return
      setTurns(history.slice(0, -1))
      setDraft(text)
      const code = e instanceof TutorError ? e.code : 'tutor_error'
      setError(code === 'warming_up' ? 'ask.warming' : code === 'rate_limited' ? 'ask.slowDown' : 'ask.error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={assembling ? 'ask-tutor ask-tutor--guide' : 'ask-tutor'} aria-label={t('ask.title')}>
      <span className="hud-tag">{t('ask.title')}</span>

      {turns.length > 0 && (
        <div className="ask-log" ref={log} aria-live="polite">
          {turns.map((turn, i) => (
            <p key={i} className={`ask-turn ask-turn--${turn.role}`}>
              {turn.content || <span className="ask-thinking">{t('ask.thinking')}</span>}
            </p>
          ))}
        </div>
      )}

      {turns.length === 0 && (
        <div className="ask-suggestions">
          {(suggestions ?? SUGGESTIONS[model])?.map((key) => (
            <button key={key} type="button" className="ask-chip" disabled={busy} onClick={() => ask(t(key))}>
              {t(key)}
            </button>
          ))}
        </div>
      )}

      {error && <p className="ask-error">{t(error)}</p>}

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(draft)
        }}
      >
        <input
          type="text"
          value={draft}
          maxLength={600}
          placeholder={t('ask.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="hud-button hud-button--primary" disabled={busy || !draft.trim()}>
          {t('ask.send')}
        </button>
      </form>

      {model === 'heart' && <p className="panel-hint">{t('ask.medical')}</p>}
    </section>
  )
}
