import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useLang, useT, type I18nKey } from '../i18n'
import { LangToggle } from '../ui/LangToggle'
import { authErrorKey, safeNext } from './authErrors'
import { resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail, useAuth } from './authStore'

type Mode = 'login' | 'signup'
type Notice = { kind: 'error' | 'info'; key: I18nKey }

export function AuthPage({ mode }: { mode: Mode }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const status = useAuth((s) => s.status)
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const otherMode = mode === 'login' ? 'signup' : 'login'
  const otherHref = `/${otherMode}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  if (status === 'signedIn') return <Navigate to={next} replace />

  const run = async (action: () => Promise<void>, success?: I18nKey) => {
    setBusy(true)
    setNotice(null)
    try {
      await action()
      if (success) setNotice({ kind: 'info', key: success })
    } catch (error) {
      const key = authErrorKey(error)
      if (key) setNotice({ kind: 'error', key })
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(() => (mode === 'signup' ? signUpWithEmail(name.trim(), email.trim(), password) : signInWithEmail(email.trim(), password)))
  }

  const forgot = () => {
    if (!email.trim()) return setNotice({ kind: 'error', key: 'auth.error.emailFirst' })
    void run(() => resetPassword(email.trim(), lang), 'auth.resetSent')
  }

  return (
    <main className="landing auth">
      <div className="landing-grid" aria-hidden="true" />
      <header className="landing-bar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {t('app.name')}
        </Link>
        <LangToggle />
      </header>

      <section className="auth-card">
        <span className="hud-tag">{t(mode === 'login' ? 'auth.login' : 'auth.signup')}</span>
        <h1>{t(mode === 'login' ? 'auth.loginTitle' : 'auth.signupTitle')}</h1>
        <p className="auth-lead">{t('auth.lead')}</p>

        {status === 'unconfigured' ? (
          <p className="auth-notice" data-kind="error">
            {t('auth.unconfigured')}
          </p>
        ) : (
          <>
            <button type="button" className="auth-google" disabled={busy} onClick={() => void run(signInWithGoogle)}>
              <GoogleMark />
              {t('auth.google')}
            </button>

            <div className="auth-divider">
              <span>{t('auth.or')}</span>
            </div>

            <form className="auth-form" onSubmit={submit}>
              {mode === 'signup' && (
                <label>
                  <span>{t('auth.name')}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={60} />
                </label>
              )}
              <label>
                <span>{t('auth.email')}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              <label>
                <span>{t('auth.password')}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={6}
                  required
                />
              </label>
              {mode === 'login' && (
                <button type="button" className="auth-link" onClick={forgot} disabled={busy}>
                  {t('auth.forgot')}
                </button>
              )}

              {notice && (
                <p className="auth-notice" data-kind={notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
                  {t(notice.key)}
                </p>
              )}

              <button type="submit" className="start-button auth-submit" disabled={busy || status === 'loading'}>
                {t(mode === 'login' ? 'auth.loginAction' : 'auth.signupAction')}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          </>
        )}

        <p className="auth-switch">
          {t(mode === 'login' ? 'auth.noAccount' : 'auth.haveAccount')}{' '}
          <Link to={otherHref}>{t(mode === 'login' ? 'auth.signup' : 'auth.login')}</Link>
        </p>
      </section>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
