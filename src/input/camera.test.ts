import { describe, expect, it } from 'vitest'
import { classifyCameraError } from './camera'

const domError = (name: string) => Object.assign(new Error(name), { name })

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'notFound'],
    ['OverconstrainedError', 'notFound'],
    ['NotSupportedError', 'unsupported'],
    ['AbortError', 'unknown'],
  ])('maps %s to %s', (name, kind) => {
    expect(classifyCameraError(domError(name))).toBe(kind)
  })

  it('treats non-errors as unknown', () => {
    expect(classifyCameraError('nope')).toBe('unknown')
  })
})
