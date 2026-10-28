import { Link } from 'react-router'
import { useAuth } from '../auth/authStore'
import { useLang, useT } from '../i18n'
import { AccountButton } from '../ui/AccountButton'
import { LangToggle } from '../ui/LangToggle'
import { useSubscription } from './billingStore'
import { Checkout } from './Checkout'
import { formatAmount, formatPlanPrice, PLANS } from './pricing'
import { SubscriptionStatus } from './SubscriptionStatus'

// Anyone can see the plan; paying needs an account, so signed-out visitors get a login link back here.
export function PricingPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const authStatus = useAuth((s) => s.status)
  const { subscribed } = useSubscription()

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
        </span>
      </header>

      <section className="profile-body">
        <span className="hud-tag">{t('billing.title')}</span>
        <h1>
          {formatPlanPrice('monthly', lang)} <span className="billing-per">{t('billing.perMonth')}</span>
        </h1>
        <p className="profile-meta">{t('billing.planBody')}</p>
        {lang === 'en' && (
          <p className="profile-note">
            {t('billing.charged')} {formatAmount(PLANS.monthly.amountMnt, 'mn')}
          </p>
        )}

        {authStatus === 'signedIn' && <SubscriptionStatus link={false} />}

        <div className="billing-actions">
          {authStatus === 'signedIn' ? (
            <Checkout renew={subscribed} />
          ) : (
            authStatus !== 'loading' && (
              <Link
                to={`/login?next=${encodeURIComponent('/pricing')}`}
                className="hud-button hud-button--primary"
              >
                {t('billing.loginToSubscribe')}
              </Link>
            )
          )}
        </div>
      </section>
    </main>
  )
}
