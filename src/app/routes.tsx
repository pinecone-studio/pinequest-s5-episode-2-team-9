import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
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
      <Suspense fallback={<div className="lab" />}>
        <LabPage />
      </Suspense>
    ),
  },
  { path: '*', element: <LandingPage /> },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
