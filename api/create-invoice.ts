// POST /api/create-invoice  (Authorization: Bearer <Firebase ID token>)  body: { lang: 'en' | 'mn' }
// Opens a Wire payment for one month and returns what the buyer needs to pay: the QR and bank links.
import { randomUUID } from 'node:crypto'
import { requireUser } from './_lib/admin.js'
import { recordInvoice } from './_lib/billing.js'
import { handle, json, readJson } from './_lib/http.js'
import { PLAN_AMOUNT_MNT, PLAN_ID } from './_lib/plan.js'
import { confirmIntent, createIntent } from './_lib/wire.js'

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = await readJson(request)
    const lang = body.lang === 'mn' ? 'mn' : 'en'
    const email = user.email ?? null
    const name = typeof user.name === 'string' ? user.name : null

    const created = await createIntent({
      amount: PLAN_AMOUNT_MNT,
      description: lang === 'mn' ? 'Hologemma — 1 сарын эрх' : 'Hologemma — 1 month',
      // metadata lets the webhook find the user even if the payments/ write below never landed.
      metadata: { uid: user.uid, plan: PLAN_ID, ...(email && { email }) },
      idempotencyKey: `create-${user.uid}-${randomUUID()}`,
    })
    await recordInvoice(created.id, { uid: user.uid, email, name, lang })
    const intent = await confirmIntent(created.id)
    const action = intent.nextAction

    return json({
      invoiceId: intent.id,
      expiresAt: intent.expiresAt,
      qrText: action?.type === 'qr' ? action.text : null,
      qrImageUrl: action?.type === 'qr' ? action.imageUrl : null,
      deeplinks: action?.type === 'qr' ? action.deeplinks : [],
      redirectUrl: action?.type === 'redirect' ? action.url : null,
    })
  })
}
