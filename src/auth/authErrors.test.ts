import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import { authErrorKey, safeNext } from './authErrors'

describe('authErrorKey', () => {
  it('maps known Firebase codes', () => {
    expect(authErrorKey({ code: 'auth/invalid-credential' })).toBe('auth.error.credentials')
    expect(authErrorKey({ code: 'auth/email-already-in-use' })).toBe('auth.error.emailInUse')
    expect(authErrorKey({ code: 'auth/weak-password' })).toBe('auth.error.weakPassword')
    expect(authErrorKey({ code: 'auth/network-request-failed' })).toBe('auth.error.network')
  })

  it('stays quiet when the user closes the Google popup', () => {
    expect(authErrorKey({ code: 'auth/popup-closed-by-user' })).toBeNull()
  })

  it('falls back to a generic message', () => {
    expect(authErrorKey({ code: 'auth/something-new' })).toBe('auth.error.generic')
    expect(authErrorKey(new Error('boom'))).toBe('auth.error.generic')
    expect(authErrorKey(undefined)).toBe('auth.error.generic')
  })

  it('only returns keys that exist', () => {
    const codes = ['auth/invalid-credential', 'auth/email-already-in-use', 'auth/invalid-email', 'auth/weak-password',
      'auth/too-many-requests', 'auth/network-request-failed', 'auth/popup-blocked',
      'auth/account-exists-with-different-credential', 'x']
    for (const code of codes) expect(Object.keys(en)).toContain(authErrorKey({ code }))
  })
})

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/lab/heart')).toBe('/lab/heart')
  })

  it('rejects anything that could leave the site', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('/\\evil.example')).toBe('/')
  })
})
