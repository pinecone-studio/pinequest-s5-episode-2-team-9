import { useT } from '../i18n'
import { useTheme } from './theme'

export function ThemeToggle() {
  const t = useT()
  const theme = useTheme((state) => state.theme)
  const toggleTheme = useTheme((state) => state.toggleTheme)
  const label = t(theme === 'dark' ? 'theme.switchToLight' : 'theme.switchToDark')

  return (
    <button
      type="button"
      className="hud-button theme-toggle"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.93 4.93l1.42 1.42 M17.65 17.65l1.42 1.42 M4.93 19.07l1.42-1.42 M17.65 6.35l1.42-1.42" />
          </>
        ) : (
          <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
        )}
      </svg>
    </button>
  )
}
