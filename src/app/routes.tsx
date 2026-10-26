import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import LandingPage from '../landing/LandingPage'

// The lab (3D, camera and later MediaPipe) loads only on /lab/* routes.
const LabPage = lazy(() => import('../lab/LabPage'))

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    path: '/lab/:modelId',
    element: (
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
