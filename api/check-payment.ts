// POST /api/check-payment  (Authorization: Bearer <Firebase ID token>)  body: { invoiceId }
// The page polls this while the QR is shown. It asks Wire directly, so it works even when the
// webhook is slow or not registered yet.
import { requireUser } from './_lib/admin.js'
import { paymentOwner, settle } from './_lib/billing.js'
import { handle, HttpError, json, readJson } from './_lib/http.js'
import { getIntent } from './_lib/wire.js'

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const { invoiceId } = await readJson(request)
    if (typeof invoiceId !== 'string' || !/^[\w-]{1,100}$/.test(invoiceId)) {
      throw new HttpError(400, 'bad_request', 'invoiceId is required')
    }
    // Same answer for "missing" and "someone else's", so ids can't be probed.
    if ((await paymentOwner(invoiceId)) !== user.uid) throw new HttpError(404, 'not_found', 'No such invoice')
    return json(await settle(await getIntent(invoiceId)))
  })
}
