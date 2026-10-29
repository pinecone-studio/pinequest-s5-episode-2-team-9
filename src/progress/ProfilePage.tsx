import { Link } from 'react-router'
import { useAuth } from '../auth/authStore'
import { SubscriptionStatus } from '../billing/SubscriptionStatus'
import { useLang, useT, useTx } from '../i18n'
import { keys } from '../models/ModelDefinition'
import { library } from '../models/registry'
import { AccountButton } from '../ui/AccountButton'
import { LangToggle } from '../ui/LangToggle'
import { ThemeToggle } from '../ui/ThemeToggle'
import { totals } from './progress'
import { ProgressLine } from './ProgressLine'
import { retryProgress, useProgress } from './progressStore'

export function ProfilePage() {
  const t = useT()
  const tx = useTx()
  const lang = useLang((s) => s.lang)
  const user = useAuth((s) => s.user)
  const { status, byModel, memberSince } = useProgress()
  const sum = totals(library, byModel)
  const since = memberSince
    ? new Intl.DateTimeFormat(lang === 'mn' ? 'mn-MN' : 'en-US', { dateStyle: 'long' }).format(memberSince)
    : null

  return (
    <main className="landing profile">
      <div className="landing-grid" aria-hidden="true" />
      <header className="landing-bar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {t('app.name')}
        </Link>
        <span className="landing-bar-actions">
          <AccountButton />
          <LangToggle />
          <ThemeToggle />
        </span>
      </header>

      <section className="profile-body">
        <span className="hud-tag">{t('profile.title')}</span>
        <h1>{user?.name || user?.email || t('profile.title')}</h1>
        <p className="profile-meta">
          {user?.name && user.email}
          {since && (
            <>
              {user?.name && user.email && ' · '}
              {t('profile.memberSince')} {since}
            </>
          )}
        </p>
        <SubscriptionStatus />

        {(status === 'loading' || status === 'off') && (
          <p className="profile-note" role="status">
            {t('profile.loading')}
          </p>
        )}
        {status === 'error' && (
          <div className="profile-recovery">
            <p className="auth-notice" data-kind="error" role="alert">
              {t('profile.error')}
            </p>
            <button type="button" className="hud-button" onClick={() => void retryProgress()}>
              {t('profile.retry')}
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="profile-stats">
              <Stat label={t('profile.models')} value={`${sum.modelsStarted}/${sum.models}`} />
              <Stat label={t('profile.parts')} value={`${sum.studied}/${sum.parts}`} />
              <Stat label={t('profile.assemblies')} value={String(sum.assemblies)} />
            </div>

            {sum.modelsStarted === 0 && <p className="profile-note">{t('profile.empty')}</p>}

            <ul className="profile-models">
              {library.map((def) => (
                <li key={def.id} style={{ '--accent': def.accent } as React.CSSProperties}>
                  <div>
                    <h2>{tx(keys.title(def.id))}</h2>
                    <ProgressLine def={def} />
                    {!byModel[def.id] && <span className="profile-note">{t('profile.notStarted')}</span>}
                  </div>
                  <Link to={`/lab/${def.slug}`} className="hud-button">
                    {t('profile.open')}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
