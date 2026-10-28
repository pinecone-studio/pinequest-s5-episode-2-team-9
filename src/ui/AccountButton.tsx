import { Link } from 'react-router'
import { logOut, useAuth } from '../auth/authStore'
import { isAdminEmail } from '../billing/pricing'
import { useT } from '../i18n'

/** "Log in" when signed out; the user's name and "Log out" when signed in. */
export function AccountButton() {
  const t = useT()
  const { status, user } = useAuth()
  if (status === 'loading' || status === 'unconfigured') return null
  if (!user) {
    return (
      <Link to="/login" className="hud-button">
        {t('auth.login')}
      </Link>
    )
  }
  return (
    <span className="account">
      {isAdminEmail(user.email) && (
        <Link to="/admin" className="hud-button">
          {t('admin.title')}
        </Link>
      )}
      <Link to="/profile" className="account-name" title={user.email ?? undefined}>
        {user.name || user.email}
      </Link>
      <button type="button" className="hud-button" onClick={() => void logOut()}>
        {t('auth.logout')}
      </button>
    </span>
  )
}
