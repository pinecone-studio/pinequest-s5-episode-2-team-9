import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthPage } from '../auth/AuthPage'
import { RequireAuth } from '../auth/RequireAuth'
import { ProfilePage } from '../progress/ProfilePage'
import { MobileGate } from '../lab/MobileGate'
import LandingPage from '../landing/LandingPage'
import { isMobileDevice } from '../ui/device'

// The lab (3D, camera and later MediaPipe) loads only on /lab/* routes.
const LabPage = lazy(() => import('../lab/LabPage'))

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    path: '/lab/:modelId',
    element: isMobileDevice() ? (
      <MobileGate />
    ) : (
      <RequireAuth>
        <Suspense fallback={<div className="lab" />}>
          <LabPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/signup', element: <AuthPage mode="signup" /> },
  {
    path: '/profile',
    element: (
      <RequireAuth>
        <ProfilePage />
      </RequireAuth>
    ),
  },
  { path: '*', element: <LandingPage /> },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
