import { create } from 'zustand'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'hologemma.theme'
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

function readPreference(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

let preference = readPreference()

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#04050b' : '#f5f8fc')
}

export const useTheme = create<{ theme: Theme; toggleTheme: () => void }>((set, get) => ({
  theme: preference ?? (systemTheme.matches ? 'dark' : 'light'),
  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark'
    preference = theme
    applyTheme(theme)
    set({ theme })
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // The toggle still works when the browser blocks storage.
    }
  },
}))

export function startTheme() {
  applyTheme(useTheme.getState().theme)
  systemTheme.addEventListener('change', (event) => {
    if (preference !== null) return
    const theme = event.matches ? 'dark' : 'light'
    applyTheme(theme)
    useTheme.setState({ theme })
  })
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    preference = readPreference()
    const theme = preference ?? (systemTheme.matches ? 'dark' : 'light')
    applyTheme(theme)
    useTheme.setState({ theme })
  })
}
