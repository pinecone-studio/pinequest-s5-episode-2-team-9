import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLang, useT } from '../i18n'
import { checkPayment, createInvoice, type Invoice } from './billingApi'
import { markPaid } from './billingStore'
import { QrCode } from './QrCode'

type Phase =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'awaiting'; invoice: Invoice }
  | { kind: 'paid' }
  | { kind: 'expired' }
  | { kind: 'failed' }
  | { kind: 'error' }

const POLL_MS = 3000
// Wire cancels an unpaid intent after 10 minutes; stop asking a little after that.
const GIVE_UP_MS = 15 * 60 * 1000

export function Checkout({ renew }: { renew: boolean }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const invoiceId = phase.kind === 'awaiting' ? phase.invoice.invoiceId : null

  async function start() {
    setPhase({ kind: 'creating' })
    try {
      setPhase({ kind: 'awaiting', invoice: await createInvoice(lang) })
    } catch (error) {
      console.warn('[billing]', error)
      setPhase({ kind: 'error' })
    }
  }

  useEffect(() => {
    if (!invoiceId) return
    const startedAt = Date.now()
    let busy = false
    const timer = setInterval(async () => {
      if (busy) return
      if (Date.now() - startedAt > GIVE_UP_MS) return setPhase({ kind: 'expired' })
      busy = true
      try {
        const res = await checkPayment(invoiceId)
        if (res.status === 'paid') {
          markPaid(res.currentPeriodEnd)
          setPhase({ kind: 'paid' })
        } else if (res.status === 'expired' || res.status === 'failed') {
          setPhase({ kind: res.status })
        }
      } catch (error) {
        // A dropped poll is fine; the next one (or the webhook) catches up.
        console.warn('[billing]', error)
      } finally {
        busy = false
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [invoiceId])

  switch (phase.kind) {
    case 'idle':
      return (
        <button type="button" className="hud-button hud-button--primary" onClick={() => void start()}>
          {t(renew ? 'billing.renew' : 'billing.subscribe')}
        </button>
      )
    case 'creating':
      return <p className="profile-note">{t('billing.creating')}</p>
    case 'awaiting': {
      const { invoice } = phase
      return (
        <div className="billing-pay">
          {(invoice.qrText || invoice.qrImageUrl) && (
            <>
              <p className="profile-meta">{t('billing.scan')}</p>
              <QrCode text={invoice.qrText} imageUrl={invoice.qrImageUrl} alt={t('billing.qrAlt')} />
            </>
          )}
          {invoice.deeplinks.length > 0 && (
            <>
              <p className="profile-meta">{t('billing.openBank')}</p>
              <ul className="billing-banks">
                {invoice.deeplinks.map((d) => (
                  <li key={d.name + d.link}>
                    <a href={d.link} className="hud-button">
                      {d.logo && <img src={d.logo} alt="" width={20} height={20} />}
                      {d.name}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          {invoice.redirectUrl && (
            <a
              href={invoice.redirectUrl}
              target="_blank"
              rel="noreferrer"
              className="hud-button hud-button--primary"
            >
              {t('billing.redirect')}
            </a>
          )}
          <p className="profile-note" role="status">
            {t('billing.waiting')}
          </p>
          <button type="button" className="hud-button" onClick={() => setPhase({ kind: 'idle' })}>
            {t('billing.cancel')}
          </button>
        </div>
      )
    }
    case 'paid':
      return (
        <div className="billing-pay">
          <p className="auth-notice" role="status">
            {t('billing.paid')}
          </p>
          <Link to="/profile" className="hud-button">
            {t('billing.toProfile')}
          </Link>
        </div>
      )
    default:
      return (
        <div className="billing-pay">
          <p className="auth-notice" data-kind="error" role="alert">
            {t(
              phase.kind === 'expired'
                ? 'billing.expiredInvoice'
                : phase.kind === 'failed'
                  ? 'billing.failed'
                  : 'billing.error',
            )}
          </p>
          <button type="button" className="hud-button" onClick={() => void start()}>
            {t('billing.retry')}
          </button>
        </div>
      )
  }
}
