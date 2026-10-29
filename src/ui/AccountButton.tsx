import { Link } from 'react-router'
import { logOut, useAuth } from '../auth/authStore'
import { isAdminEmail } from '../billing/pricing'
import { useT } from '../i18n'

function AccountIcon({ kind }: { kind: 'login' | 'logout' | 'profile' }) {
  const paths = {
    login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
    profile: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2',
  }
  return (
    <svg
      className="account-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'profile' && <circle cx="12" cy="7" r="4" />}
      <path d={paths[kind]} />
    </svg>
  )
}

/** "Log in" when signed out; the user's name and "Log out" when signed in. */
export function AccountButton() {
  const t = useT()
  const { status, user } = useAuth()
  if (status === 'loading' || status === 'unconfigured') return null
  if (!user) {
    return (
      <Link to="/login" className="hud-button">
        <AccountIcon kind="login" />
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
        <AccountIcon kind="profile" />
        <span className="account-label">{user.name || user.email}</span>
      </Link>
      <button type="button" className="hud-button" onClick={() => void logOut()}>
        <AccountIcon kind="logout" />
        {t('auth.logout')}
      </button>
    </span>
  )
}
