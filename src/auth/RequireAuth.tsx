import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './authStore'

/** The lab needs an account. Signed-out visitors go to /login and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status)
  const location = useLocation()
  if (status === 'loading') return <div className="lab" />
  if (status !== 'signedIn') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children
}
