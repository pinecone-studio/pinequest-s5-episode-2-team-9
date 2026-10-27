import { useT } from '../i18n'
import type { ModelDefinition } from '../models/ModelDefinition'
import { formatDuration, summarize } from './progress'
import { useProgress } from './progressStore'

/** "Studied 7/18 · Assembled ×2 · Best 2:31" with a thin bar. Nothing until the model is started. */
export function ProgressLine({ def }: { def: ModelDefinition }) {
  const t = useT()
  const p = useProgress((s) => (s.status === 'ready' ? s.byModel[def.id] : undefined))
  const s = summarize(def, p)
  if (!s.started) return null
  return (
    <div className="progress-line">
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={s.total}
        aria-valuenow={s.studied}
      >
        <i style={{ width: `${(100 * s.studied) / s.total}%` }} />
      </div>
      <span>
        {t('progress.studied')} {s.studied}/{s.total}
        {s.assemblies > 0 && (
          <>
            {' · '}
            {t('progress.assembled')} ×{s.assemblies}
          </>
        )}
        {s.bestAssemblyMs !== null && (
          <>
            {' · '}
            {t('progress.best')} {formatDuration(s.bestAssemblyMs)}
          </>
        )}
      </span>
    </div>
  )
}
