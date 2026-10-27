// Cookieless Vercel Web Analytics: page views plus a few product events.
// Never sends camera data — only names like "assembly_complete".
import { inject, track } from '@vercel/analytics'

export function startAnalytics(): void {
  inject()
}

export function event(name: string, props?: Record<string, string | number | boolean>): void {
  try {
    track(name, props)
  } catch {
    // Analytics must never break the app.
  }
}
