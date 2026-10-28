// Wire signs every webhook delivery (docs.wire.mn/docs/guides/webhooks):
//   WirePayment-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" keyed with whsec_…>
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SIGNATURE_HEADER = 'WirePayment-Signature'
const TOLERANCE_SEC = 300 // Wire's SDK default

export function signPayload(rawBody: string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

/** Fails closed: anything missing, stale or mismatched is rejected. */
export function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false
  let t = NaN
  const sigs: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=', 2)
    if (k === 't') t = Number(v)
    else if (k === 'v1' && v) sigs.push(v)
  }
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > TOLERANCE_SEC || sigs.length === 0) return false
  const expected = Buffer.from(signPayload(rawBody, t, secret), 'hex')
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}
