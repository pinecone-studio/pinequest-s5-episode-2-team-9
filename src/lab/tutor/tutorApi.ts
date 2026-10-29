// Calls /api/ask, which streams the fine-tuned Gemma tutor's answer as plain text.
import type { Lang } from '../../i18n'

export interface TutorTurn {
  role: 'user' | 'assistant'
  content: string
}

export class TutorError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

/** Streams the answer into `onText` (the whole answer so far) and resolves with the full answer. */
export async function askTutor(
  request: { model: string; part: string | null; lang: Lang; messages: TutorTurn[]; assembling?: boolean },
  onText: (answer: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const { auth } = await import('../../auth/firebase')
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new TutorError('unauthenticated')
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new TutorError(body?.error ?? 'tutor_error')
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let answer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    answer += value
    onText(plain(answer))
  }
  answer = plain(answer)
  if (!answer.trim()) throw new TutorError('tutor_error')
  return answer
}

/** The panel shows plain text: drop markdown emphasis and heading marks a model may still add. */
const plain = (text: string) => text.replace(/\*\*|__|^#+\s*/gm, '')
