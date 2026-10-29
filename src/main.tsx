import './storageMigration'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import './ui/tailwind.css'
import { startAnalytics } from './analytics'
import { AppRoutes } from './app/routes'
import { startAuth } from './auth/authStore'
import { startProgress } from './progress/progressStore'
import { startTheme } from './ui/theme'
import { AmbientGlow } from './ui/AmbientGlow'

// Agentation feedback toolbar, development only: Vite drops this branch from production builds.
const Agentation = import.meta.env.DEV ? lazy(() => import('agentation').then((m) => ({ default: m.Agentation }))) : null

startTheme()
startAnalytics()
startAuth()
startProgress()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoutes />
    <AmbientGlow />
    {Agentation && (
      <Suspense fallback={null}>
        <Agentation endpoint="http://localhost:4747" />
      </Suspense>
    )}
  </StrictMode>,
)
