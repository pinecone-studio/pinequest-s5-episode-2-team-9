import { motion } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { unlockAudio } from '../audio/sfx'
import { useT, useTx } from '../i18n'
import { keys, type ModelDefinition } from '../models/ModelDefinition'
import { experiences, library, type Experience } from '../models/registry'
import { AccountButton } from '../ui/AccountButton'
import { ProgressLine } from '../progress/ProgressLine'
import { isMobileDevice } from '../ui/device'
import { LangToggle } from '../ui/LangToggle'
import { ModelGlyph } from './ModelGlyph'
import { pickStartWord } from './startWord'

const YEAR = new Date().getFullYear()

// The 3D hero loads after first paint so the page itself stays light.
const HeroScene = lazy(() => import('./HeroScene'))

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
}

function CopyLink() {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="ghost-button"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.origin).then(() => setCopied(true))
      }}
    >
      {copied ? t('landing.copied') : t('landing.copyLink')}
    </button>
  )
}

function LibraryCard({ def, startWord, mobile }: { def: ModelDefinition; startWord: string; mobile: boolean }) {
  const t = useT()
  const tx = useTx()
  return (
    <motion.article className="library-card" style={{ '--accent': def.accent } as React.CSSProperties} {...reveal}>
      <div className="library-visual">
        <ModelGlyph id={def.id} />
      </div>
      <div className="library-body">
        <span className="library-meta">
          {def.parts.length} {t('landing.parts')}
        </span>
        <h3>{tx(keys.title(def.id))}</h3>
        <p>{tx(keys.summary(def.id))}</p>
        <ProgressLine def={def} />
        {mobile ? (
          <div className="library-gate">
            <strong>{t('landing.needsLaptop')}</strong>
            <CopyLink />
          </div>
        ) : (
          <Link to={`/lab/${def.slug}`} className="start-button" onClick={unlockAudio}>
            {startWord}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </motion.article>
  )
}

function ExperienceCard({ exp, startWord, mobile }: { exp: Experience; startWord: string; mobile: boolean }) {
  const t = useT()
  const tx = useTx()
  return (
    <motion.article className="library-card" style={{ '--accent': exp.accent } as React.CSSProperties} {...reveal}>
      <div className="library-visual">
        <ModelGlyph id={exp.id} />
      </div>
      <div className="library-body">
        <span className="library-meta">{tx(exp.metaKey)}</span>
        <h3>{tx(exp.titleKey)}</h3>
        <p>{tx(exp.summaryKey)}</p>
        {mobile ? (
          <div className="library-gate">
            <strong>{t('landing.needsLaptop')}</strong>
            <CopyLink />
          </div>
        ) : (
          <Link to={`/lab/${exp.slug}`} className="start-button" onClick={unlockAudio}>
            {startWord}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </motion.article>
  )
}

export default function LandingPage() {
  const t = useT()
  const words = t('start.words')
  // One random word per visit (and per language switch).
  const startWord = useMemo(() => pickStartWord(words), [words])
  const mobile = useMemo(() => isMobileDevice(), [])
  const libraryRef = useRef<HTMLElement>(null)
  const [showHero, setShowHero] = useState(false)

  useEffect(() => {
    // Phones and narrow screens get the light hero: the lab needs a laptop anyway.
    if (mobile || window.innerWidth < 760) return
    const id = window.requestIdleCallback?.(() => setShowHero(true)) ?? window.setTimeout(() => setShowHero(true), 300)
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [mobile])

  // Hero assembles as you scroll: 0.25 at the top, whole after ~70% of a screen.
  const progress = useCallback(() => Math.min(1, 0.25 + window.scrollY / (window.innerHeight * 0.7)), [])

  return (
    <main className="landing">
      <div className="landing-grid" aria-hidden="true" />
      <header className="landing-bar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {t('app.name')}
        </span>
        <span className="landing-bar-actions">
          <AccountButton />
          <LangToggle />
        </span>
      </header>

      <section className="hero">
        <div className="hero-visual" aria-hidden="true">
          {showHero ? (
            <Suspense fallback={null}>
              <HeroScene def={library[0]} progress={progress} />
            </Suspense>
          ) : (
            <div className="hero-static">
              <ModelGlyph id="heart" />
            </div>
          )}
        </div>
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="eyebrow">{t('landing.eyebrow')}</span>
          <h1>{t('landing.tagline')}</h1>
          <p>{t('landing.subtitle')}</p>
          <button
            type="button"
            className="start-button start-button--hero"
            onClick={() => {
              unlockAudio()
              libraryRef.current?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            {startWord}
            <span aria-hidden="true">↓</span>
          </button>
          {mobile && <p className="hero-mobile">{t('landing.needsLaptopText')}</p>}
        </motion.div>
        <span className="scroll-cue" aria-hidden="true">
          {t('landing.scroll')}
        </span>
      </section>

      <section className="how">
        <motion.h2 {...reveal}>{t('landing.howTitle')}</motion.h2>
        <div className="how-steps">
          {(
            [
              ['landing.step1Title', 'landing.step1Text'],
              ['landing.step2Title', 'landing.step2Text'],
              ['landing.step3Title', 'landing.step3Text'],
            ] as const
          ).map(([title, text], i) => (
            <motion.div key={title} className="how-step" {...reveal} transition={{ ...reveal.transition, delay: i * 0.12 }}>
              <span className="how-index">0{i + 1}</span>
              <h3>{t(title)}</h3>
              <p>{t(text)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="library" ref={libraryRef}>
        <motion.div className="library-head" {...reveal}>
          <h2>{t('landing.libraryTitle')}</h2>
          <p>{t('landing.librarySubtitle')}</p>
        </motion.div>
        <div className="library-grid">
          {library.map((def) => (
            <LibraryCard key={def.id} def={def} startWord={startWord} mobile={mobile} />
          ))}
          {experiences.map((exp) => (
            <ExperienceCard key={exp.id} exp={exp} startWord={startWord} mobile={mobile} />
          ))}
        </div>
        {!mobile && <p className="library-note">{t('landing.mouseNote')}</p>}
      </section>

      <motion.section className="privacy" {...reveal}>
        <div className="privacy-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <path d="M24 5 9 11v11c0 10 6.5 17.5 15 21 8.5-3.5 15-11 15-21V11z" />
            <path d="m17 24 5 5 9-10" />
          </svg>
        </div>
        <div>
          <h2>{t('landing.privacyTitle')}</h2>
          <p>{t('landing.privacyText')}</p>
        </div>
      </motion.section>

      <footer className="landing-footer">
        <span>© {YEAR} Hologemma</span>
        <span>
          {library.map((m) => (
            <span key={m.id} className="footer-credit">
              <CreditLine def={m} />
            </span>
          ))}
        </span>
      </footer>
    </main>
  )
}

function CreditLine({ def }: { def: ModelDefinition }) {
  const tx = useTx()
  return <>{tx(keys.credit(def.id))}</>
}
