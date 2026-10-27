import { Link } from 'react-router'
import { useT } from '../i18n'
import { AccountButton } from './AccountButton'
import { LangToggle } from './LangToggle'

const SECTIONS = [
  ['library', 'nav.library'],
  ['how', 'nav.how'],
  ['privacy', 'nav.privacy'],
] as const

/**
 * The site's header: the wordmark in a solid block, an accent tab with the page's
 * sections, and the account and language controls at the far right. On the landing
 * page the links scroll in place; elsewhere they lead back to it.
 */
export function SiteBar({ home = false, account = true }: { home?: boolean; account?: boolean }) {
  const t = useT()
  return (
    <header className="site-bar">
      <Link to="/" className="site-mark">
        <i aria-hidden="true" />
        {t('app.name')}
      </Link>
      <nav className="site-tab" aria-label={t('nav.label')}>
        {SECTIONS.map(([id, key]) =>
          home ? (
            <a key={id} href={`#${id}`}>
              {t(key)}
            </a>
          ) : (
            <Link key={id} to={`/#${id}`}>
              {t(key)}
            </Link>
          ),
        )}
      </nav>
      <div className="site-actions">
        {account && <AccountButton />}
        <LangToggle />
      </div>
    </header>
  )
}
