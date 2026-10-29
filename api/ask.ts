// POST /api/ask  (Authorization: Bearer <Firebase ID token>)
// body: { model: 'heart' | 'computer', part: string | null, lang: 'en' | 'mn', assembling?: boolean,
//         messages: { role, content }[] }
// Asks the tutor about the selected part (or, while assembling, the part in hand) and streams the
// answer back as plain text.
// The tutor is the fine-tuned Gemma on a Hugging Face Inference Endpoint: TUTOR_ENDPOINT_URL,
// TUTOR_ENDPOINT_TOKEN. Until that is deployed, Gemini Flash's free tier answers with the same
// prompt (GEMINI_API_KEY; GEMINI_MODEL picks one model instead of the built-in list). Both speak the OpenAI chat-completions protocol.
import { requireUser } from './_lib/admin.js'
import { handle, HttpError, readJson } from './_lib/http.js'
import { cards } from './_lib/tutor/cards.js'
import { isTutorModel } from './_lib/tutor/knowledge.js'
import { systemPrompt } from './_lib/tutor/prompt.js'

/** Only the last few turns are sent: the selected part's facts matter more than a long history. */
const MAX_TURNS = 6
const MAX_CHARS = 600
const PER_MINUTE = 12

// Per instance, so only a soft limit; enough to stop a stuck loop or a pasted script.
const recent = new Map<string, number[]>()
function rateLimit(uid: string) {
  const now = Date.now()
  const hits = (recent.get(uid) ?? []).filter((t) => now - t < 60_000)
  if (hits.length >= PER_MINUTE) throw new HttpError(429, 'rate_limited', 'Too many questions')
  recent.set(uid, [...hits, now])
}

type Turn = { role: 'user' | 'assistant'; content: string }

function readTurns(value: unknown): Turn[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'bad_request', 'messages must be an array')
  const turns = value
    .filter(
      (m): m is Turn =>
        typeof m === 'object' &&
        m !== null &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS)
  while (turns[0]?.role === 'assistant') turns.shift()
  if (turns.at(-1)?.role !== 'user' || !turns.at(-1)!.content.trim()) {
    throw new HttpError(400, 'bad_request', 'The last message must be a question')
  }
  return turns
}

/** Turns the endpoint's server-sent events into a stream of answer text. */
function textStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const data = line.match(/^data: ?(.*)$/)?.[1]
          if (!data || data === '[DONE]') continue
          try {
            const text = JSON.parse(data).choices?.[0]?.delta?.content
            if (typeof text === 'string' && text) controller.enqueue(encoder.encode(text))
          } catch {
            // Keep-alive comments and partial lines carry no text.
          }
        }
      },
    }),
  )
}

/** Gemini's OpenAI-compatible endpoint (ai.google.dev/gemini-api/docs/openai). */
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
/**
 * Free-tier models, in order of preference. Flash-Lite 3.5 starts answering in about 2 s; the full
 * Flash models were overloaded or took minutes on the free tier. The second is used when the first
 * is busy or rate-limited.
 */
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']

interface Backend {
  url: string
  token: string | undefined
  /** Request fields for this backend (model name, sampling, thinking). */
  options: Record<string, unknown>
  /** Status the backend sends while it is starting up, if any. */
  warmingStatus?: number
}

/**
 * The fine-tuned Gemma endpoint when it is deployed, otherwise Gemini (one entry per model to try).
 */
function backends(): Backend[] {
  const url = process.env.TUTOR_ENDPOINT_URL
  if (url) {
    return [
      {
        url: `${url.replace(/\/$/, '')}/v1/chat/completions`,
        token: process.env.TUTOR_ENDPOINT_TOKEN,
        // TGI/vLLM endpoints ignore the name; Ollama (the offline backup) needs it. Gemma's sampling.
        options: {
          model: process.env.TUTOR_ENDPOINT_MODEL ?? 'tgi',
          max_tokens: 400,
          temperature: 1.0,
          top_p: 0.95,
        },
        // A scaled-to-zero endpoint answers 503 while it wakes up.
        warmingStatus: 503,
      },
    ]
  }
  const key = process.env.GEMINI_API_KEY
  if (key) {
    const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : GEMINI_MODELS
    // Gemini 3 always thinks a little ("low" is the least these models accept); it counts toward max_tokens.
    return models.map((model) => ({
      url: GEMINI_URL,
      token: key,
      options: { model, max_tokens: 2048, reasoning_effort: 'low' },
    }))
  }
  throw new HttpError(500, 'not_configured', 'No tutor endpoint or Gemini key')
}

/** Overloaded or out of quota: worth trying the next model. */
const BUSY = new Set([429, 500, 503])

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    rateLimit(user.uid)
    const body = await readJson(request)
    if (!isTutorModel(body.model)) throw new HttpError(400, 'bad_request', 'No tutor for this model')
    const model = body.model
    const part = typeof body.part === 'string' && cards[model].parts[body.part] ? body.part : null
    const lang = body.lang === 'mn' ? 'mn' : 'en'
    const turns = readTurns(body.messages)
    const system = systemPrompt(model, part, lang, body.assembling === true)

    let upstream: Response | null = null
    for (const to of backends()) {
      upstream = await fetch(to.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(to.token && { Authorization: `Bearer ${to.token}` }),
        },
        body: JSON.stringify({
          ...to.options,
          stream: true,
          messages: [{ role: 'system', content: system }, ...turns],
        }),
        signal: request.signal,
      })
      if (upstream.ok && upstream.body) break
      console.error('[ask] backend', to.options.model, upstream.status, await upstream.text().catch(() => ''))
      if (upstream.status === to.warmingStatus) throw new HttpError(503, 'warming_up', 'Tutor is starting')
      if (upstream.status === 401 || upstream.status === 403)
        throw new HttpError(500, 'not_configured', 'Bad API key')
      if (!BUSY.has(upstream.status)) throw new HttpError(502, 'tutor_error', 'Tutor unavailable')
    }
    if (!upstream?.ok || !upstream.body) {
      // Every model was overloaded or over the free tier's limits.
      throw new HttpError(503, 'busy', 'The tutor is busy')
    }
    return new Response(textStream(upstream.body), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  })
}
