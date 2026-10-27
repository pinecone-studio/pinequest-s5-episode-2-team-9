import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import en from './en.json'
import mn from './mn.json'

export type Lang = 'en' | 'mn'
export type I18nKey = keyof typeof en

export const dictionaries: Record<Lang, Record<I18nKey, string>> = { en, mn }

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

// English is always the default; a chosen language is remembered.
export const useLang = create<LangState>()(
  persist((set) => ({ lang: 'en', setLang: (lang) => set({ lang }) }), {
    name: 'hologemma.lang',
  }),
)

export function translate(lang: Lang, key: I18nKey): string {
  return dictionaries[lang][key] ?? dictionaries.en[key]
}

export function useT(): (key: I18nKey) => string {
  const lang = useLang((s) => s.lang)
  return (key) => translate(lang, key)
}

/** For keys built at runtime (model parts). Missing keys fall back to English, then to the key itself. */
export function useTx(): (key: string) => string {
  const lang = useLang((s) => s.lang)
  return (key) => {
    const dict = dictionaries[lang] as Record<string, string>
    return dict[key] ?? (dictionaries.en as Record<string, string>)[key] ?? key
  }
}
