import { describe, expect, it } from 'vitest'
import { heart } from '../models/heart/definition'
import { library } from '../models/registry'
import {
  emptyProgress,
  formatDuration,
  parseProgress,
  summarize,
  totals,
  withAssembly,
  withStudied,
} from './progress'

describe('progress', () => {
  it('parses Firestore data defensively', () => {
    expect(parseProgress(undefined)).toEqual(emptyProgress)
    expect(parseProgress({ studied: ['a', 3, null], assemblies: -2, bestAssemblyMs: 'x' })).toEqual({
      studied: ['a'],
      assemblies: 0,
      bestAssemblyMs: null,
      lastOpenedAt: null,
    })
    expect(parseProgress({ lastOpenedAt: { toMillis: () => 42 } }).lastOpenedAt).toBe(42)
  })

  it('adds a studied part once', () => {
    const once = withStudied(emptyProgress, 'septum')
    expect(once?.studied).toEqual(['septum'])
    expect(withStudied(once!, 'septum')).toBeNull()
  })

  it('counts assemblies and keeps the best time', () => {
    const a = withAssembly(emptyProgress, 90_000)
    const b = withAssembly(a, 120_000)
    const c = withAssembly(b, 60_000)
    expect([a.bestAssemblyMs, b.bestAssemblyMs, c.bestAssemblyMs]).toEqual([90_000, 90_000, 60_000])
    expect(c.assemblies).toBe(3)
  })

  it('ignores studied parts the model no longer has', () => {
    const p = { ...emptyProgress, studied: [heart.parts[0].id, 'gone'] }
    const s = summarize(heart, p)
    expect(s).toMatchObject({ studied: 1, total: heart.parts.length, started: true })
    expect(summarize(heart, undefined).started).toBe(false)
  })

  it('adds up totals across the library', () => {
    const t = totals(library, {
      [heart.id]: withAssembly({ ...emptyProgress, studied: [heart.parts[0].id] }, 1000),
    })
    expect(t).toMatchObject({ modelsStarted: 1, models: library.length, studied: 1, assemblies: 1 })
    expect(t.parts).toBe(library.reduce((n, d) => n + d.parts.length, 0))
  })

  it('formats durations', () => {
    expect(formatDuration(151_000)).toBe('2:31')
    expect(formatDuration(4_000)).toBe('0:04')
    expect(formatDuration(3_751_000)).toBe('1:02:31')
  })
})
