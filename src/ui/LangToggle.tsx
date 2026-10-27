import { useLang, useT } from '../i18n'

export function LangToggle() {
  const t = useT()
  const { lang, setLang } = useLang()
  return (
    <button
      type="button"
      className="hud-button"
      aria-label={t('lang.toggleLabel')}
      onClick={() => setLang(lang === 'en' ? 'mn' : 'en')}
    >
      {t('lang.toggle')}
    </button>
  )
}
