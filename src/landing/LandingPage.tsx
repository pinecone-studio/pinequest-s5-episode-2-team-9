import { useMemo } from 'react'
import { Link } from 'react-router'
import { unlockAudio } from '../audio/sfx'
import { useT, useTx } from '../i18n'
import { keys } from '../models/ModelDefinition'
import { library } from '../models/registry'
import { LangToggle } from '../ui/LangToggle'
import { pickStartWord } from './startWord'

// Phase 0 placeholder; the deep-space landing and model library come in Phase 7.
export default function LandingPage() {
  const t = useT()
  const tx = useTx()
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
        <div className="landing-starts">
          {library.map((m) => (
            <Link key={m.id} to={`/lab/${m.slug}`} className="start-button" onClick={unlockAudio}>
              {startWord} · {tx(keys.title(m.id))}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
