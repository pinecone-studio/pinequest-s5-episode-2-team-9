import { Link } from 'react-router'
import { useAuth } from '../auth/authStore'
import { useLang, useT, useTx } from '../i18n'
import { keys } from '../models/ModelDefinition'
import { library } from '../models/registry'
import { SiteBar } from '../ui/SiteBar'
import { totals } from './progress'
import { ProgressLine } from './ProgressLine'
import { useProgress } from './progressStore'

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
    <main className="site profile">
      <SiteBar />

      <section className="profile-body" aria-label={t('profile.title')}>
        <h1>{user?.name || user?.email}</h1>
        <p className="profile-meta">
          {user?.name && user.email}
          {since && (
            <>
              {user?.name && user.email && ' · '}
              {t('profile.memberSince')} {since}
            </>
          )}
        </p>

        {status === 'loading' && <p className="profile-note">{t('profile.loading')}</p>}
        {status === 'error' && (
          <p className="auth-notice" data-kind="error" role="alert">
            {t('profile.error')}
          </p>
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
                  <Link to={`/lab/${def.slug}`} className="btn btn--quiet">
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
