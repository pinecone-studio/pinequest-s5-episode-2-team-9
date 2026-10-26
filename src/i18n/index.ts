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
    name: 'hololemma.lang',
  }),
)

export function translate(lang: Lang, key: I18nKey): string {
  return dictionaries[lang][key] ?? dictionaries.en[key]
}

export function useT(): (key: I18nKey) => string {
  const lang = useLang((s) => s.lang)
  return (key) => translate(lang, key)
}
