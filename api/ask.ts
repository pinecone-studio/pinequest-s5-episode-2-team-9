// POST /api/ask  (Authorization: Bearer <Firebase ID token>)
// body: { model: 'heart' | 'computer', part: string | null, lang: 'en' | 'mn', assembling?: boolean,
//         messages: { role, content }[] }
// Asks the tutor about the selected part (or, while assembling, the part in hand) and streams the
// answer back as plain text.
// The tutor is the fine-tuned Gemma on a Hugging Face Inference Endpoint (OpenAI-compatible):
// TUTOR_ENDPOINT_URL, TUTOR_ENDPOINT_TOKEN. Until that is deployed, Claude Haiku answers with the
// same prompt (ANTHROPIC_API_KEY).
import Anthropic from '@anthropic-ai/sdk'
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

/** The fallback tutor: Claude Haiku with the same system prompt, streamed as plain text. */
function claudeStream(system: string, turns: Turn[], signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        const stream = new Anthropic().messages.stream(
          {
            model: 'claude-haiku-5-5',
            max_tokens: 1024,
            // Short, friendly answers: little thinking needed.
            output_config: { effort: 'low' },
            system,
            messages: turns,
          },
          { signal },
        )
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        controller.close()
      } catch (error) {
        console.error(
          '[ask] claude',
          error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error,
        )
        controller.error(error)
      }
    },
  })
}

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

    const url = process.env.TUTOR_ENDPOINT_URL
    if (!url) {
      if (!process.env.ANTHROPIC_API_KEY)
        throw new HttpError(500, 'not_configured', 'No tutor endpoint or API key')
      return new Response(claudeStream(system, turns, request.signal), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
    const upstream = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.TUTOR_ENDPOINT_TOKEN && {
          Authorization: `Bearer ${process.env.TUTOR_ENDPOINT_TOKEN}`,
        }),
      },
      body: JSON.stringify({
        // TGI/vLLM endpoints ignore the name; Ollama (the offline backup) needs it.
        model: process.env.TUTOR_ENDPOINT_MODEL ?? 'tgi',
        stream: true,
        max_tokens: 400,
        // Gemma's recommended sampling settings.
        temperature: 1.0,
        top_p: 0.95,
        messages: [{ role: 'system', content: system }, ...turns],
      }),
      signal: request.signal,
    })
    if (!upstream.ok || !upstream.body) {
      console.error('[ask] endpoint', upstream.status, await upstream.text().catch(() => ''))
      // A scaled-to-zero endpoint answers 503 while it wakes up.
      throw new HttpError(
        upstream.status === 503 ? 503 : 502,
        upstream.status === 503 ? 'warming_up' : 'tutor_error',
        'Tutor unavailable',
      )
    }
    return new Response(textStream(upstream.body), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  })
}
