import { describe, expect, it } from 'vitest'
import { signPayload, verifySignature } from '../../api/_lib/webhookSignature'

const SECRET = 'whsec_test'
const BODY = '{"id":"evt_1","type":"payment_intent.succeeded","data":{"id":"pi_1"}}'
const T = 1_800_000_000

describe('verifySignature', () => {
  const header = `t=${T},v1=${signPayload(BODY, T, SECRET)}`

  it('accepts a fresh, correct signature', () => {
    expect(verifySignature(BODY, header, SECRET, T + 10)).toBe(true)
  })

  it('accepts any matching v1 when several are sent', () => {
    expect(verifySignature(BODY, `t=${T},v1=deadbeef,v1=${signPayload(BODY, T, SECRET)}`, SECRET, T)).toBe(
      true,
    )
  })

  it('rejects a changed body, wrong secret, stale timestamp or missing parts', () => {
    expect(verifySignature(BODY + ' ', header, SECRET, T)).toBe(false)
    expect(verifySignature(BODY, header, 'whsec_other', T)).toBe(false)
    expect(verifySignature(BODY, header, SECRET, T + 301)).toBe(false)
    expect(verifySignature(BODY, null, SECRET, T)).toBe(false)
    expect(verifySignature(BODY, `v1=${signPayload(BODY, T, SECRET)}`, SECRET, T)).toBe(false)
    expect(verifySignature(BODY, header, '', T)).toBe(false)
  })
})
