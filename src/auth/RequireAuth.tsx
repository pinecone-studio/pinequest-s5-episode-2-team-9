import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useT } from '../i18n'
import { useAuth } from './authStore'

/** The lab needs an account. Signed-out visitors go to /login and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status)
  const location = useLocation()
  const t = useT()
  if (status === 'loading') {
    return (
      <main className="mobile-gate" role="status" aria-busy="true">
        <div>
          <p>{t('auth.loading')}</p>
        </div>
      </main>
    )
  }
  if (status !== 'signedIn') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children
}
