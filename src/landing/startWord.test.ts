import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import mn from '../i18n/mn.json'
import { pickStartWord } from './startWord'

describe('pickStartWord', () => {
  it('can return every English word', () => {
    const words = en['start.words'].split('|')
    expect(words).toHaveLength(15)
    words.forEach((word, i) => {
      expect(pickStartWord(en['start.words'], () => (i + 0.5) / words.length)).toBe(word)
    })
  })

  it('always returns the single Mongolian word', () => {
    expect(pickStartWord(mn['start.words'], () => 0.99)).toBe('Эхлэх')
  })
})
