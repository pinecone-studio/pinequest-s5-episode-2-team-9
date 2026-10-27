import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { unlockAudio } from '../audio/sfx'
import { useT, useTx } from '../i18n'
import { keys, type ModelDefinition } from '../models/ModelDefinition'
import { experiences, library } from '../models/registry'
import { ProgressLine } from '../progress/ProgressLine'
import { isMobileDevice } from '../ui/device'
import { SiteBar } from '../ui/SiteBar'
import './landing.css'
import { PullApart } from './PullApart'

const YEAR = new Date().getFullYear()

// Stills captured from the lab itself (public/landing), one per model.
const STILL: Record<string, string> = {
  heart: 'heart',
  brain: 'brain',
  skeleton: 'skeleton',
  muscles: 'muscles',
  robotDog: 'robot-dog',
  rocketEngine: 'rocket-engine',
  electricMotor: 'electric-motor',
  computer: 'computer',
  atoms: 'atoms',
}

const spring = { type: 'spring', bounce: 0, duration: 0.8 } as const

/** Section parts rise into place one after another as the section enters. */
const rise = (i = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '0px 0px -10% 0px' },
  transition: { ...spring, delay: i * 0.075 },
})

function CopyLink() {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn--quiet"
      onClick={() => void navigator.clipboard?.writeText(window.location.origin).then(() => setCopied(true))}
    >
      {copied ? t('landing.copied') : t('landing.copyLink')}
    </button>
  )
}

function Masthead() {
  const t = useT()
  const tx = useTx()
  const title = (id: string) => tx(keys.title(id as ModelDefinition['id']))
  const apart = (id: string) => `${title(id)}, ${t('landing.pullApart').toLowerCase()}`
  return (
    <section className="masthead" aria-labelledby="title">
      {/* A gutterless mosaic of real stills from the lab and flat colour tiles. */}
      <div className="mosaic">
        <img className="m-a" src="/landing/heart.webp" alt={title('heart')} width={1200} height={1500} />
        <img className="m-b" src="/landing/brain.webp" alt={title('brain')} width={1200} height={1200} />
        <span className="m-c tile tile--accent" aria-hidden="true" />
        <img className="m-d" src="/landing/computer-apart.webp" alt={apart('computer')} width={1200} height={1500} />
        <span className="m-e tile tile--3" aria-hidden="true" />
        <img className="m-f" src="/landing/rocket-apart.webp" alt={apart('rocketEngine')} width={900} height={1500} />
        <span className="m-g tile tile--deep" aria-hidden="true" />
        <img className="m-h" src="/landing/electric-motor.webp" alt={title('electricMotor')} width={1200} height={1200} />
        <span className="m-i tile tile--ink" aria-hidden="true" />
      </div>

      <div className="masthead-copy">
        <h1 id="title" className="masthead-title">
          {[t('landing.title1'), t('landing.title2')].map((line, i) => (
            <span className="line" key={i}>
              <motion.span
                initial={{ y: '108%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.12 + i * 0.11 }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.div
          className="masthead-stand"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.45 }}
        >
          <p>{t('landing.subtitle')}</p>
          <a className="btn" href="#library" onClick={unlockAudio}>
            {t('landing.cta')}
            <span aria-hidden="true">↓</span>
          </a>
        </motion.div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const t = useT()
  const steps = [
    ['landing.step1Title', 'landing.step1Text', 'step-camera', 'landing.shotCamera'],
    ['landing.step2Title', 'landing.step2Text', 'step-hands', 'landing.shotHands'],
    ['landing.step3Title', 'landing.step3Text', 'step-assemble', 'landing.shotAssemble'],
  ] as const
  return (
    <section className="how" id="how" aria-labelledby="how-title">
      <motion.h2 id="how-title" className="section-title how-title" {...rise()}>
        {t('landing.howTitle')}
      </motion.h2>
      <div className="how-column">
        {steps.map(([lead, text, shot, alt]) => (
          <div className="how-stage" key={shot}>
            <motion.h3 className="how-lead" {...rise(0)}>
              {t(lead)}
            </motion.h3>
            <div>
              <motion.p {...rise(1)}>{t(text)}</motion.p>
              <motion.figure {...rise(2)}>
                <img src={`/landing/${shot}.webp`} alt={t(alt)} width={1280} height={800} loading="lazy" />
              </motion.figure>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

interface Entry {
  id: string
  slug: string
  title: string
  summary: string
  meta: string
  def?: ModelDefinition
}

function Library({ mobile }: { mobile: boolean }) {
  const t = useT()
  const tx = useTx()
  const entries: Entry[] = useMemo(
    () => [
      ...library.map((def) => ({
        id: def.id,
        slug: def.slug,
        title: tx(keys.title(def.id)),
        summary: tx(keys.summary(def.id)),
        meta: `${def.parts.length} ${t('landing.parts')}`,
        def,
      })),
      ...experiences.map((exp) => ({
        id: exp.id,
        slug: exp.slug,
        title: tx(exp.titleKey),
        summary: tx(exp.summaryKey),
        meta: t('landing.interactive'),
      })),
    ],
    [t, tx],
  )
  const [active, setActive] = useState(0)
  const rows = useRef<(HTMLLIElement | null)[]>([])

  // The row crossing the middle of the screen becomes the active one as you scroll.
  useEffect(() => {
    const io = new IntersectionObserver(
      (seen) => {
        for (const s of seen) if (s.isIntersecting) setActive(Number((s.target as HTMLElement).dataset.index))
      },
      { rootMargin: '-48% 0px -48% 0px' },
    )
    rows.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [entries.length])

  return (
    <section className="library" id="library" aria-labelledby="library-title">
      <div className="library-photo" aria-live="polite">
        {entries.map((e, i) => (
          <img
            key={e.id}
            src={`/landing/${STILL[e.id]}.webp`}
            alt={i === active ? e.title : ''}
            aria-hidden={i !== active}
            data-active={i === active}
            width={1200}
            height={1500}
            loading={i < 2 ? 'eager' : 'lazy'}
          />
        ))}
      </div>

      <div className="library-list">
        <motion.h2 id="library-title" className="section-title" {...rise()}>
          {t('landing.libraryTitle')}
        </motion.h2>
        <ol>
          {entries.map((e, i) => {
            const open = i === active
            return (
              <li
                key={e.id}
                ref={(el) => {
                  rows.current[i] = el
                }}
                data-index={i}
                data-active={open}
                onPointerEnter={(ev) => ev.pointerType === 'mouse' && setActive(i)}
              >
                <button
                  type="button"
                  className="lib-row"
                  aria-expanded={open}
                  aria-controls={`lib-${e.id}`}
                  onClick={() => setActive(i)}
                  onFocus={() => setActive(i)}
                >
                  <span className="lib-name">{e.title}</span>
                  <span className="lib-meta">{e.meta}</span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      id={`lib-${e.id}`}
                      className="lib-detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
                    >
                      <div className="lib-detail-inner">
                        <p>{e.summary}</p>
                        {e.def && <ProgressLine def={e.def} />}
                        {mobile ? (
                          <div className="lib-gate">
                            <strong>{t('landing.needsLaptop')}</strong>
                            <CopyLink />
                          </div>
                        ) : (
                          <Link to={`/lab/${e.slug}`} className="btn" onClick={unlockAudio}>
                            {t('landing.open')}
                            <span className="visually-hidden">: {e.title}</span>
                            <span aria-hidden="true">→</span>
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ol>
        <motion.p className="library-note" {...rise()}>
          {mobile ? t('landing.needsLaptopText') : t('landing.mouseNote')}
        </motion.p>
      </div>
    </section>
  )
}

function Privacy() {
  const t = useT()
  const facts = [
    ['landing.factRuns', 'landing.factRunsValue'],
    ['landing.factVideo', 'landing.factVideoValue'],
    ['landing.factNeeds', 'landing.factNeedsValue'],
    ['landing.factLang', 'landing.factLangValue'],
  ] as const
  return (
    <section className="privacy" id="privacy" aria-labelledby="privacy-title">
      <motion.h2 id="privacy-title" className="section-title" {...rise()}>
        {t('landing.privacyTitle')}
      </motion.h2>
      <motion.p className="privacy-lead" {...rise(1)}>
        {t('landing.privacyText')}
      </motion.p>
      <div className="privacy-tiles">
        <motion.figure className="privacy-photo" {...rise(0)}>
          <img src="/landing/heart-apart.webp" alt={t('landing.privacyAlt')} width={1200} height={1500} loading="lazy" />
          <figcaption>{t('landing.privacyNote')}</figcaption>
        </motion.figure>
        <div className="privacy-side">
          <motion.div className="privacy-tile" {...rise(1)} aria-hidden="true">
            {/* A laptop, drawn as one filled shape, with its camera marked. */}
            <svg viewBox="0 0 240 160">
              <path d="M40 18h160a8 8 0 0 1 8 8v100H32V26a8 8 0 0 1 8-8Zm6 14v86h148V32Z" fill="currentColor" fillRule="evenodd" />
              <path d="M8 130h224l-10 14a8 8 0 0 1-6.5 3.3H24.5A8 8 0 0 1 18 144Z" fill="currentColor" />
              <circle cx="120" cy="25" r="4.5" className="privacy-dot" />
            </svg>
          </motion.div>
          <dl className="privacy-facts">
            {facts.map(([label, value], i) => (
              <motion.div key={label} {...rise(i)}>
                <dt>{t(label)}</dt>
                <dd>{t(value)}</dd>
              </motion.div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const t = useT()
  const tx = useTx()
  return (
    <footer className="site-footer">
      <p className="footer-name" aria-hidden="true">
        {t('app.name')}
      </p>
      <div className="footer-row">
        <nav className="footer-links" aria-label={t('nav.label')}>
          <a href="#library">{t('nav.library')}</a>
          <a href="#how">{t('nav.how')}</a>
          <a href="#privacy">{t('nav.privacy')}</a>
          <Link to="/login">{t('auth.login')}</Link>
        </nav>
        <div className="footer-credits">
          <h2>{t('landing.credits')}</h2>
          <ul>
            {library.map((m) => (
              <li key={m.id}>{tx(keys.credit(m.id))}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="footer-legal">
        <span>
          © {YEAR} {t('app.name')}
        </span>
        <a href="#title">{t('landing.backToTop')}</a>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  const mobile = useMemo(() => isMobileDevice(), [])
  // The 3D heart only on laptops and desktops wide enough to show it.
  const [live] = useState(() => !mobile && typeof window !== 'undefined' && window.innerWidth >= 760)
  const location = useLocation()

  // Arriving from another page with #library etc.: scroll there once the page is laid out.
  useEffect(() => {
    if (!location.hash) return
    const id = window.setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 60)
    return () => window.clearTimeout(id)
  }, [location.hash])

  return (
    <MotionConfig reducedMotion="user">
      <main className="site landing-page">
        <SiteBar home />
        <Masthead />
        <PullApart live={live} />
        <HowItWorks />
        <Library mobile={mobile} />
        <Privacy />
        <Footer />
      </main>
    </MotionConfig>
  )
}
