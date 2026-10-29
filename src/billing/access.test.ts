import { describe, expect, it } from 'vitest'
import { modelAccess, parsePicks, picksLeft } from './access'

describe('modelAccess', () => {
  it('opens everything for subscribers', () => {
    expect(modelAccess({ unlimited: true, picks: [] }, 'heart')).toBe('open')
  })

  it('opens a model the user picked', () => {
    expect(modelAccess({ unlimited: false, picks: ['heart', 'brain'] }, 'brain')).toBe('open')
  })

  it('offers a pick while picks are left', () => {
    expect(modelAccess({ unlimited: false, picks: [] }, 'heart')).toBe('canPick')
    expect(modelAccess({ unlimited: false, picks: ['heart'] }, 'brain')).toBe('canPick')
  })

  it('locks the rest once both picks are used', () => {
    expect(modelAccess({ unlimited: false, picks: ['heart', 'brain'] }, 'lungs')).toBe('locked')
  })
})

describe('picksLeft', () => {
  it('counts down to zero', () => {
    expect(picksLeft({ unlimited: false, picks: [] })).toBe(2)
    expect(picksLeft({ unlimited: false, picks: ['heart'] })).toBe(1)
    expect(picksLeft({ unlimited: false, picks: ['heart', 'brain'] })).toBe(0)
  })
})

describe('parsePicks', () => {
  it('reads the stored list', () => {
    expect(parsePicks({ models: ['heart', 'brain'] })).toEqual(['heart', 'brain'])
  })

  it('tolerates a missing doc and junk', () => {
    expect(parsePicks(undefined)).toEqual([])
    expect(parsePicks({ models: 'heart' })).toEqual([])
    expect(parsePicks({ models: ['heart', 3, 'brain', 'lungs'] })).toEqual(['heart', 'brain'])
  })
})
