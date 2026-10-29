import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthPage } from '../auth/AuthPage'
import { AccessGate } from '../billing/AccessGate'
import { RequireAuth } from '../auth/RequireAuth'
import { ProfilePage } from '../progress/ProfilePage'
import { MobileGate } from '../lab/MobileGate'
import LandingPage from '../landing/LandingPage'
import { isMobileDevice } from '../ui/device'

// The lab (3D, camera and later MediaPipe) loads only on /lab/* routes.
const LabPage = lazy(() => import('../lab/LabPage'))
const AdminPage = lazy(() => import('../admin/AdminPage'))

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    path: '/lab/:modelId',
    element: isMobileDevice() ? (
      <MobileGate />
    ) : (
      <RequireAuth>
        <AccessGate>
          <Suspense fallback={<div className="lab" />}>
            <LabPage />
          </Suspense>
        </AccessGate>
      </RequireAuth>
    ),
  },
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/signup', element: <AuthPage mode="signup" /> },
  // Public: anyone sees the plan; the page itself sends signed-out visitors to log in before paying.
  { path: '/pricing', lazy: async () => ({ Component: (await import('../billing/PricingPage')).PricingPage }) },
  {
    path: '/profile',
    element: (
      <RequireAuth>
        <ProfilePage />
      </RequireAuth>
    ),
  },
  {
    path: '/admin',
    element: (
      <RequireAuth>
        <Suspense fallback={<div className="landing" />}>
          <AdminPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  { path: '*', element: <LandingPage /> },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
