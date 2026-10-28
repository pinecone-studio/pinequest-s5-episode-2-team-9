import { WireError } from './wire.js'

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** Runs a handler and turns thrown errors into JSON. Details go to the logs, not to the browser. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code }, error.status)
    console.error('[billing]', error)
    if (error instanceof WireError) return json({ error: 'provider_error' }, 502)
    return json({ error: 'server_error' }, 500)
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null)
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}
