import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/authStore'
import { useLang, useT, useTx } from '../i18n'
import { keys } from '../models/ModelDefinition'
import { library, modelBySlug } from '../models/registry'
import { ThemeToggle } from '../ui/ThemeToggle'
import { modelAccess, picksLeft } from './access'
import { claimPick, refreshPicks, useAccess } from './accessStore'
import { refreshSubscription } from './billingStore'
import { formatPlanPrice } from './pricing'

/**
 * Stands in front of /lab/:modelId. Labs and unknown slugs pass straight through (the lab handles
 * those); a model opens only for subscribers or as one of the user's free picks.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const t = useT()
  const tx = useTx()
  const lang = useLang((s) => s.lang)
  const uid = useAuth((s) => s.user?.uid ?? null)
  const { modelId = '' } = useParams()
  const def = modelBySlug(modelId)
  const { status, access } = useAccess()
  const [claiming, setClaiming] = useState(false)
  const [claimFailed, setClaimFailed] = useState(false)

  if (!def) return children
  if (status === 'loading' || status === 'off') return <div className="lab" />

  const back = (
    <Link to="/" className="hud-button">
      ← {t('lab.back')}
    </Link>
  )

  if (status === 'error' || !uid) {
    return (
      <Gate>
        <h1>{t('access.errorTitle')}</h1>
        <p>{t('access.errorText')}</p>
        <button
          type="button"
          className="hud-button hud-button--primary"
          onClick={() => {
            if (!uid) return
            void refreshSubscription(uid)
            void refreshPicks(uid)
          }}
        >
          {t('billing.retry')}
        </button>
        {back}
      </Gate>
    )
  }

  const state = modelAccess(access, def.id)
  if (state === 'open') return children

  const subscribe = (
    <Link to="/pricing" className={state === 'locked' ? 'hud-button hud-button--primary' : 'hud-button'}>
      {t('access.subscribe')} · {formatPlanPrice('monthly', lang)} {t('billing.perMonth')}
    </Link>
  )

  if (state === 'canPick') {
    return (
      <Gate>
        <span className="hud-tag">{t('access.freePick')}</span>
        <h1>{tx(keys.title(def.id))}</h1>
        <p>{t('access.pickText')}</p>
        <p>
          <strong>
            {t('access.picksLeft')} {picksLeft(access)}
          </strong>
        </p>
        {claimFailed && <p className="access-error">{t('access.claimFailed')}</p>}
        <button
          type="button"
          className="hud-button hud-button--primary"
          disabled={claiming}
          onClick={() => {
            setClaiming(true)
            setClaimFailed(false)
            claimPick(uid, def.id)
              .catch((error) => {
                console.warn('[billing]', error)
                setClaimFailed(true)
                // The stored picks may differ from ours (another tab); show the real state.
                void refreshPicks(uid)
              })
              .finally(() => setClaiming(false))
          }}
        >
          {t('access.usePick')}
        </button>
        {subscribe}
        {back}
      </Gate>
    )
  }

  return (
    <Gate>
      <span className="hud-tag">{t('billing.status')}</span>
      <h1>{tx(keys.title(def.id))}</h1>
      <p>{t('access.lockedText')}</p>
      <p>
        {t('access.yourPicks')}{' '}
        {library
          .filter((m) => access.picks.includes(m.id))
          .map((m, i) => (
            <span key={m.id}>
              {i > 0 && ', '}
              <Link to={`/lab/${m.slug}`}>{tx(keys.title(m.id))}</Link>
            </span>
          ))}
      </p>
      {subscribe}
      {back}
    </Gate>
  )
}

function Gate({ children }: { children: ReactNode }) {
  return (
    <main className="mobile-gate access-gate">
      <div>
        {children}
        <ThemeToggle />
      </div>
    </main>
  )
}
