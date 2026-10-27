import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { startAnalytics } from './analytics'
import { AppRoutes } from './app/routes'
import { startAuth } from './auth/authStore'
import { startProgress } from './progress/progressStore'

startAnalytics()
startAuth()
startProgress()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoutes />
  </StrictMode>,
)
