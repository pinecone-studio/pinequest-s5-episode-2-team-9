import { useState } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'

// The lab needs hands in front of a laptop webcam; phones get a friendly redirect.
export function MobileGate() {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <main className="mobile-gate">
      <div>
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {t('app.name')}
        </span>
        <h1>{t('landing.needsLaptop')}</h1>
        <p>{t('landing.needsLaptopText')}</p>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true))}
        >
          {copied ? t('landing.copied') : t('landing.copyLink')}
        </button>
        <Link to="/" className="hud-button">
          ← {t('lab.back')}
        </Link>
      </div>
    </main>
  )
}
