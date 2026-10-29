import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/authStore'
import { formatAmount, formatPlanPrice, isAdminEmail } from '../billing/pricing'
import { useLang, useT, type I18nKey } from '../i18n'
import { AccountButton } from '../ui/AccountButton'
import { LangToggle } from '../ui/LangToggle'
import { ThemeToggle } from '../ui/ThemeToggle'
import type { AdminData } from './adminData'
import { planState, summarize, type PlanState } from './adminStats'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: AdminData }

const stateKey: Record<PlanState, I18nKey> = {
  active: 'admin.plan.active',
  pending: 'admin.plan.pending',
  expired: 'admin.plan.expired',
  none: 'admin.plan.none',
}

/** Who signed up, who pays, and how much. Firestore rules are the real gate; this check only hides the page. */
export default function AdminPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const user = useAuth((s) => s.user)
  const isAdmin = isAdminEmail(user?.email)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [reloads, setReloads] = useState(0)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (!isAdmin) return
    let live = true
    import('./adminData')
      .then((m) => m.loadAdminData())
      .then((data) => live && setLoad({ status: 'ready', data }))
      .catch((error) => {
        console.warn('[admin]', error)
        if (live) setLoad({ status: 'error' })
      })
    return () => {
      live = false
    }
  }, [isAdmin, reloads])

  const summary = useMemo(() => (load.status === 'ready' ? summarize(load.data, now) : null), [load, now])
  const date = (ms: number | null) =>
    ms ? new Intl.DateTimeFormat(lang === 'mn' ? 'mn-MN' : 'en-US', { dateStyle: 'medium' }).format(ms) : '—'

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

      <section className="profile-body admin-body">
        <span className="hud-tag">{t('admin.title')}</span>

        {!isAdmin ? (
          <p className="auth-notice" data-kind="error" role="alert">
            {t('admin.denied')}
          </p>
        ) : (
          <>
            <p className="profile-meta">
              {t('admin.price')} {formatPlanPrice('monthly', lang)} / {t('admin.month')}
              {' · '}
              <button
                type="button"
                className="admin-link"
                onClick={() => {
                  setLoad({ status: 'loading' })
                  setReloads((n) => n + 1)
                }}
              >
                {t('admin.refresh')}
              </button>
            </p>

            {load.status === 'loading' && <p className="profile-note">{t('admin.loading')}</p>}
            {load.status === 'error' && (
              <p className="auth-notice" data-kind="error" role="alert">
                {t('admin.error')}
              </p>
            )}

            {load.status === 'ready' && summary && (
              <>
                <div className="profile-stats">
                  <Stat label={t('admin.registered')} value={String(summary.registered)} />
                  <Stat label={t('admin.subscribers')} value={String(summary.active)} />
                  <Stat
                    label={t('admin.revenueMonth')}
                    value={formatAmount(summary.revenueThisMonthMnt, lang)}
                  />
                  <Stat label={t('admin.revenueTotal')} value={formatAmount(summary.revenueMnt, lang)} />
                </div>

                <h2 className="admin-heading">{t('admin.users')}</h2>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t('admin.col.user')}</th>
                        <th>{t('admin.col.joined')}</th>
                        <th>{t('admin.col.lang')}</th>
                        <th>{t('admin.col.plan')}</th>
                        <th>{t('admin.col.until')}</th>
                        <th className="num">{t('admin.col.paid')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...load.data.users]
                        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                        .map((u) => {
                          const sub = load.data.subscriptions[u.uid]
                          const state = planState(sub, now)
                          const paid = summary.paidByUser[u.uid] ?? 0
                          // Each user's money is shown the way they see prices: $ in English, ₮ in Mongolian.
                          const userLang = u.lang ?? 'en'
                          return (
                            <tr key={u.uid}>
                              <td>
                                <strong>{u.name || '—'}</strong>
                                <span>{u.email}</span>
                              </td>
                              <td>{date(u.createdAt)}</td>
                              <td>{u.lang ? u.lang.toUpperCase() : '—'}</td>
                              <td>
                                <span className="admin-plan" data-state={state}>
                                  {state === 'none'
                                    ? t(stateKey.none)
                                    : `${t('admin.monthly')} · ${t(stateKey[state])}`}
                                </span>
                              </td>
                              <td>{sub ? date(sub.currentPeriodEnd) : '—'}</td>
                              <td className="num">{paid ? formatAmount(paid, userLang) : '—'}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>

                <h2 className="admin-heading">{t('admin.payments')}</h2>
                {load.data.payments.length === 0 ? (
                  <p className="profile-note">{t('admin.noPayments')}</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>{t('admin.col.date')}</th>
                          <th>{t('admin.col.user')}</th>
                          <th>{t('admin.col.status')}</th>
                          <th className="num">{t('admin.col.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {load.data.payments.map((p) => {
                          const payer = load.data.users.find((u) => u.uid === p.uid)
                          return (
                            <tr key={p.id}>
                              <td>{date(p.paidAt ?? p.createdAt)}</td>
                              <td>{payer?.email ?? p.email ?? p.uid}</td>
                              <td>
                                <span
                                  className="admin-plan"
                                  data-state={p.status === 'paid' ? 'active' : p.status}
                                >
                                  {t(`admin.payment.${p.status}` as I18nKey)}
                                </span>
                              </td>
                              <td className="num">{formatAmount(p.amountMnt, payer?.lang ?? 'en')}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
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
