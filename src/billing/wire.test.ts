import { describe, expect, it } from 'vitest'
import { parseIntent } from '../../api/_lib/wire'

// Shapes from docs.wire.mn (PaymentIntent object and the quickstart's next_action example).
const confirmed = {
  id: 'pi_123',
  object: 'payment_intent',
  amount: 7000,
  currency: 'MNT',
  status: 'requires_action',
  metadata: { uid: 'u1', plan: 'monthly' },
  next_action: {
    type: 'qr',
    qr: {
      text: '0002010102121531',
      deeplinks: [{ name: 'Example bank', link: 'examplebank://pay?qr=1' }, { name: 'Broken' }],
    },
  },
  created: 1_800_000_000,
  expires_at: 1_800_000_600,
}

describe('parseIntent', () => {
  it('reads the QR, bank links and expiry', () => {
    const intent = parseIntent(confirmed)
    expect(intent).toMatchObject({ id: 'pi_123', status: 'requires_action', amount: 7000, currency: 'MNT' })
    expect(intent.metadata.uid).toBe('u1')
    expect(intent.expiresAt).toBe(1_800_000_600_000)
    expect(intent.nextAction).toEqual({
      type: 'qr',
      text: '0002010102121531',
      imageUrl: null,
      deeplinks: [{ name: 'Example bank', link: 'examplebank://pay?qr=1' }],
    })
  })

  it('reads a redirect and treats other actions as "keep waiting"', () => {
    const redirect = parseIntent({
      ...confirmed,
      next_action: { type: 'redirect_to_url', redirect_to_url: { url: 'https://pay.example' } },
    })
    expect(redirect.nextAction).toEqual({ type: 'redirect', url: 'https://pay.example' })
    expect(parseIntent({ ...confirmed, next_action: { type: 'poll', poll: {} } }).nextAction).toEqual({
      type: 'wait',
    })
  })

  it('handles a paid intent with no next action', () => {
    const paid = parseIntent({ ...confirmed, status: 'succeeded', next_action: null, expires_at: null })
    expect(paid.status).toBe('succeeded')
    expect(paid.nextAction).toBeNull()
    expect(paid.expiresAt).toBeNull()
  })

  it('marks statuses it does not know', () => {
    expect(parseIntent({ ...confirmed, status: 'something_new' }).status).toBe('unknown')
  })

  it('rejects anything that is not an intent', () => {
    expect(() => parseIntent({ error: { code: 'x' } })).toThrow()
    expect(() => parseIntent(null)).toThrow()
  })
})
