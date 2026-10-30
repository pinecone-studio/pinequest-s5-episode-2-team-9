import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_MODELS, knowledge, TUTOR_MODELS } from '../api/_lib/tutor/knowledge'
import { partContext, systemPrompt } from '../api/_lib/tutor/prompt'
import { library } from '../src/models/registry'
import { buildTutorCards, renderTutorCards } from './lib/tutorCards'

describe('tutor cards', () => {
  it('are up to date with src/i18n (run npx tsx scripts/build-tutor-cards.ts)', () => {
    expect(readFileSync('api/_lib/tutor/cards.ts', 'utf8')).toBe(renderTutorCards(buildTutorCards()))
  })
})

describe.each(KNOWLEDGE_MODELS)('%s tutor knowledge', (id) => {
  const def = library.find((m) => m.id === id)!
  const infoIds = new Set(def.parts.map((p) => p.info ?? p.id))
  const known = new Set([...def.parts.map((p) => p.id), ...infoIds])
  const facts = knowledge[id]!

  it('covers every part', () => {
    for (const info of infoIds) expect(facts, info).toHaveProperty([info])
    for (const key of Object.keys(facts)) expect(infoIds, `unknown entry ${key}`).toContain(key)
  })

  it('links only to real parts (snake_case names must be part ids)', () => {
    for (const [key, entry] of Object.entries(facts)) {
      for (const c of entry.connections) {
        for (const ref of [c.to, c.via])
          if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(ref)) expect(known, `${key} → ${ref}`).toContain(ref)
      }
    }
  })
})

describe.each(TUTOR_MODELS)('%s tutor prompt', (id) => {
  const def = library.find((m) => m.id === id)!

  it('never shows raw part ids to the model', () => {
    for (const part of def.parts) {
      for (const lang of ['en', 'mn'] as const) {
        const text = systemPrompt(id, part.id, lang)
        expect(text).toContain(partContext(id, part.id, lang))
        expect(text, part.id).not.toMatch(/\b[a-z0-9]+_[a-z0-9_]+\b/)
      }
    }
  })
})
