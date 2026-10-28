// POST /api/wire-webhook — Wire's event deliveries. Register this URL with Wire (see .env.example).
// The body only tells us *which* intent changed: we verify the signature, then ask Wire for the
// intent itself before granting anything.
import { handle, json } from './_lib/http.js'
import { settle } from './_lib/billing.js'
import { SIGNATURE_HEADER, verifySignature } from './_lib/webhookSignature.js'
import { getIntent } from './_lib/wire.js'

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const raw = await request.text() // the signature covers the exact bytes, so read before parsing
    const secret = process.env.WIRE_WEBHOOK_SECRET ?? ''
    const event = parse(raw)
    if (!verifySignature(raw, request.headers.get(SIGNATURE_HEADER), secret)) {
      // ASSUMED: Wire's endpoint.verification ping may arrive before we have the secret (it's
      // shown once, when the endpoint is created). Answering it grants nothing, so let it pass.
      if (event?.type === 'endpoint.verification') return json({ received: true })
      return json({ error: 'bad_signature' }, 400)
    }
    if (!event) return json({ error: 'bad_request' }, 400)
    const intentId = event.data?.id
    if (event.type?.startsWith('payment_intent.') && typeof intentId === 'string') {
      // Errors bubble up as 5xx, and Wire retries those.
      const outcome = await settle(await getIntent(intentId))
      console.info('[billing] webhook', event.id, event.type, intentId, outcome.status)
    }
    // Other events (endpoint.verification, charge.refunded) just need a 2xx.
    return json({ received: true })
  })
}

type WireEvent = { id?: string; type?: string; data?: { id?: unknown } }

function parse(raw: string): WireEvent | null {
  try {
    const v: unknown = JSON.parse(raw)
    return typeof v === 'object' && v !== null ? (v as WireEvent) : null
  } catch {
    return null
  }
}
