import { describe, expect, it } from 'vitest'
import en from './en.json'
import mn from './mn.json'

describe('i18n dictionaries', () => {
  it('have the same keys in English and Mongolian', () => {
    expect(Object.keys(mn).sort()).toEqual(Object.keys(en).sort())
  })

  it('have no empty strings', () => {
    for (const dict of [en, mn]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe('')
      }
    }
  })
})
