// Every call to the Wire payment API (https://docs.wire.mn) lives in this file. Wire is a
// gateway in front of Mongolian operators (QPay and others); we use its PaymentIntent flow:
//   1. POST /v1/payment_intents                 → intent `pi_…`, status requires_payment_method
//   2. POST /v1/payment_intents/{id}/confirm     → status requires_action, next_action.qr
//   3. GET  /v1/payment_intents/{id}             → status succeeded once the buyer pays
// Verified against the docs (Oct 2026): base URL, Bearer `sk_live_…` auth, Idempotency-Key on
// every POST, integer MNT amounts, Unix-second timestamps, the status values, the error
// envelope, and next_action.qr { text, image_url, deeplinks[{ name, link }] }.
// ASSUMED (not spelled out in the docs): the bank deeplink objects may also carry a `logo`
// (read if present, never required), and operator ids are whatever the dashboard's Connectors
// page lists. Set WIRE_OPERATORS to pin QPay once you know its id there.

const API_BASE = process.env.WIRE_API_BASE || 'https://api.wire.mn'

export type IntentStatus =
  'requires_payment_method' | 'requires_action' | 'requires_capture' | 'processing' | 'succeeded' | 'canceled'

export type Deeplink = { name: string; link: string; logo?: string }

export type NextAction =
  | { type: 'qr'; text: string | null; imageUrl: string | null; deeplinks: Deeplink[] }
  | { type: 'redirect'; url: string }
  // loan_app, loan_credit_decision and poll: nothing to show, keep checking.
  | { type: 'wait' }

export interface Intent {
  id: string
  status: IntentStatus | 'unknown'
  amount: number
  currency: string
  metadata: Record<string, string>
  nextAction: NextAction | null
  /** Unix ms, or null when Wire sets no expiry. Intents expire after 10 minutes by default. */
  expiresAt: number | null
}

export class WireError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const STATUSES: IntentStatus[] = [
  'requires_payment_method',
  'requires_action',
  'requires_capture',
  'processing',
  'succeeded',
  'canceled',
]

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)

/** Turns Wire's JSON into an Intent, tolerating missing optional fields. Throws if it isn't one. */
export function parseIntent(json: unknown): Intent {
  if (!isObj(json) || typeof json.id !== 'string')
    throw new WireError(502, 'bad_response', 'Not a payment intent')
  const status = STATUSES.find((s) => s === json.status) ?? 'unknown'
  const metadata: Record<string, string> = {}
  if (isObj(json.metadata)) {
    for (const [k, v] of Object.entries(json.metadata)) if (typeof v === 'string') metadata[k] = v
  }
  return {
    id: json.id,
    status,
    amount: typeof json.amount === 'number' ? json.amount : NaN,
    currency: typeof json.currency === 'string' ? json.currency : '',
    metadata,
    nextAction: parseNextAction(json.next_action),
    expiresAt: typeof json.expires_at === 'number' ? json.expires_at * 1000 : null,
  }
}

export function parseNextAction(v: unknown): NextAction | null {
  if (!isObj(v)) return null
  if (v.type === 'qr' && isObj(v.qr)) {
    const deeplinks = Array.isArray(v.qr.deeplinks)
      ? v.qr.deeplinks.flatMap((d): Deeplink[] => {
          if (!isObj(d)) return []
          const name = str(d.name)
          const link = str(d.link)
          const logo = str(d.logo)
          return name && link ? [logo ? { name, link, logo } : { name, link }] : []
        })
      : []
    return { type: 'qr', text: str(v.qr.text), imageUrl: str(v.qr.image_url), deeplinks }
  }
  if (v.type === 'redirect_to_url' && isObj(v.redirect_to_url)) {
    const url = str(v.redirect_to_url.url)
    if (url) return { type: 'redirect', url }
  }
  return { type: 'wait' }
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string) {
  const key = process.env.WIRE_API_KEY
  if (!key) throw new WireError(500, 'not_configured', 'WIRE_API_KEY is not set')
  const res = await fetch(`${API_BASE}/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    // Error envelope: { error: { type, code, message, param, request_id } }
    const err = isObj(json) && isObj(json.error) ? json.error : {}
    throw new WireError(
      res.status,
      str(err.code) ?? 'http_' + res.status,
      `Wire ${method} ${path}: ${str(err.message) ?? res.statusText} (${str(err.request_id) ?? 'no request id'})`,
    )
  }
  return parseIntent(json)
}

const allowedOperators = () =>
  (process.env.WIRE_OPERATORS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export function createIntent(input: {
  amount: number
  description: string
  metadata: Record<string, string>
  idempotencyKey: string
}): Promise<Intent> {
  const operators = allowedOperators()
  return call(
    'POST',
    '/payment_intents',
    {
      amount: input.amount,
      currency: 'MNT',
      description: input.description,
      metadata: input.metadata,
      ...(operators.length > 0 && { allowed_operators: operators }),
    },
    input.idempotencyKey,
  )
}

/** Picks the operator and returns the intent with next_action (the QR and bank links). */
export function confirmIntent(id: string): Promise<Intent> {
  const [operator] = allowedOperators()
  return call(
    'POST',
    `/payment_intents/${encodeURIComponent(id)}/confirm`,
    operator ? { operator } : {},
    `confirm-${id}`,
  )
}

export function getIntent(id: string): Promise<Intent> {
  return call('GET', `/payment_intents/${encodeURIComponent(id)}`)
}
