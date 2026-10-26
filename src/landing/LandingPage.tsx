import { useMemo } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import { LangToggle } from '../ui/LangToggle'
import { pickStartWord } from './startWord'

// Phase 0 placeholder; the deep-space landing and model library come in Phase 7.
export default function LandingPage() {
  const t = useT()
  const words = t('start.words')
  const startWord = useMemo(() => pickStartWord(words), [words])

  return (
    <main className="landing">
      <header className="landing-bar">
        <span className="brand">{t('app.name')}</span>
        <LangToggle />
      </header>
      <section className="landing-hero">
        <h1>{t('landing.tagline')}</h1>
        <p>{t('landing.subtitle')}</p>
        <Link to="/lab/test" className="start-button">
          {startWord}
        </Link>
      </section>
    </main>
  )
}
