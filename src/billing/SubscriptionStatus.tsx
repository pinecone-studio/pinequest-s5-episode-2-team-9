import { Link } from 'react-router'
import { useLang, useT } from '../i18n'
import { useSubscription } from './billingStore'

/** One line on the profile (and pricing) page: the plan's state and a link to /pricing. */
export function SubscriptionStatus({ link = true }: { link?: boolean }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { status, sub, subscribed } = useSubscription()
  if (status !== 'ready') return null
  // 'pending' only means an invoice was opened, so it reads like "no subscription". A lapsed
  // subscriber sees when it ended; someone who never paid has no meaningful date.
  const end = sub?.currentPeriodEnd && (subscribed || sub.lastPaymentAt) ? sub.currentPeriodEnd : null
  const date = end
    ? new Intl.DateTimeFormat(lang === 'mn' ? 'mn-MN' : 'en-US', { dateStyle: 'long' }).format(end)
    : null
  return (
    <div className="billing-status">
      <span className="hud-tag">{t('billing.status')}</span>
      <span>
        {t(subscribed ? 'billing.activeUntil' : date ? 'billing.expiredOn' : 'billing.none')}
        {date && ` ${date}`}
      </span>
      {link && (
        <Link to="/pricing" className="hud-button">
          {t(subscribed ? 'billing.renew' : 'billing.viewPlan')}
        </Link>
      )}
    </div>
  )
}
