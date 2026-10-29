// Builds the fine-tuning dataset for the Hologemma tutor (a Gemma model trained on Kaggle, see training/).
// A teacher model writes student questions and ideal answers for every part, in English and Mongolian,
// using only the facts in api/_lib/tutor. Each example is stored in the exact chat format api/ask.ts
// sends at runtime: the system prompt from systemPrompt(), the student's question, the answer.
//
// Needs ANTHROPIC_API_KEY. About 200 requests for the default 2 rounds.
//
// Usage: npx tsx --env-file=.env.local scripts/build-tutor-dataset.ts [--rounds 2] [--model heart] [--concurrency 4]
//        add --limit 2 for a quick test on the first two (part, language) pairs
//        add --resume to keep training/data and only fill parts that are missing examples
//        rounds alternate: odd rounds write assembly-guide conversations (the part in the student's hand)
//        add --teacher claude-haiku-5-5 for a cheaper teacher model (default claude-opus-5-5)
// Output: training/data/train.jsonl, training/data/eval.jsonl, training/data/review.md
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { cards } from '../api/_lib/tutor/cards'
import { TUTOR_MODELS, type TutorModelId } from '../api/_lib/tutor/knowledge'
import { systemPrompt, type TutorLang } from '../api/_lib/tutor/prompt'

const { values: args } = parseArgs({
  options: {
    rounds: { type: 'string', default: '2' },
    model: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    limit: { type: 'string' },
    resume: { type: 'boolean', default: false },
    teacher: { type: 'string', default: 'claude-opus-5-5' },
  },
})

const OUT = 'training/data'
const EVAL_SHARE = 0.1

const Batch = z.object({
  examples: z.array(
    z.object({
      kind: z.enum([
        'function',
        'connection',
        'condition',
        'why',
        'compare',
        'follow_up',
        'own_symptoms',
        'off_topic',
        'unknown',
        'placement',
        'not_yet',
      ]),
      /** Earlier turns of a short conversation, empty for a single question. */
      history: z.array(z.object({ student: z.string(), tutor: z.string() })),
      student: z.string(),
      tutor: z.string(),
    }),
  ),
})
type Example = z.infer<typeof Batch>['examples'][number]

const KINDS: Record<TutorModelId, string> = {
  heart: `- function: what the part does
- connection: what it connects to, where blood comes from and goes to
- condition: diseases and problems that affect it (school level, no diagnosis)
- own_symptoms: the student describes their own symptom ("my chest hurts when I run"); the tutor stays calm, gives no diagnosis and says to tell a parent and see a doctor
- why, compare (with another heart part), follow_up (a 2–3 turn conversation)`,
  computer: `- function: what the part does
- connection: exactly which cable, connector, slot or header it uses and where that sits on the board
- condition: what happens if it fails, overheats or is plugged in wrong
- why, compare (with another computer part), follow_up (a 2–3 turn conversation)`,
}

/** Assembly-guide rounds: the student is fitting the part right now. */
const ASSEMBLY_KINDS = `- placement: where exactly the part goes (the opening, socket, slot or header) and how to fit it
- not_yet: the student tried it too early; the tutor names what must be in place first and why
- connection: what flows through it once it is in (blood, power or data) and where to
- why, follow_up (a 2–3 turn conversation while fitting it)`

function teacherPrompt(
  model: TutorModelId,
  partId: string | null,
  lang: TutorLang,
  count: number,
  avoid: string[],
  assembling: boolean,
) {
  return `You are writing training data for "Hologemma", a small tutor model inside a 3D science lab for students aged 14–18.

Below is the exact system prompt the tutor will receive at runtime. Write ${count} realistic examples of a student asking and the tutor answering, following every rule in it.

<tutor_system_prompt>
${systemPrompt(model, partId, lang, assembling)}
</tutor_system_prompt>

Mix these kinds:
${assembling ? ASSEMBLY_KINDS : KINDS[model]}
- off_topic (2 examples): a question unrelated to the model, which the tutor politely declines and steers back
- unknown (1 example): a fair question the facts do not cover; the tutor says what it does know and that it is not sure about the rest

Rules for the examples:
- Students write like real teenagers: short, casual, sometimes misspelled, sometimes vague ("what does this do", "where does this plug in"). Write the student's text in ${lang === 'mn' ? 'Mongolian (Cyrillic), as Mongolian students type' : 'English'}.
- Tutor answers: ${lang === 'mn' ? 'natural Mongolian (Cyrillic), not a word-for-word translation' : 'English'}, 2–5 short sentences, friendly, no markdown headings, no lists unless the student asks for steps.
- Every fact in a tutor answer must come from the system prompt, or be basic school science consistent with it. Never invent numbers, names or connectors.
- "this part", "it" and "this" refer to the selected part${partId ? '' : ' (none is selected, so the tutor may ask which part the student means)'}.
- history is empty except for follow_up examples.${avoid.length ? `\n- Do not repeat these questions already written:\n${avoid.map((q) => `  - ${q}`).join('\n')}` : ''}`
}

const client = new Anthropic()

async function generate(
  model: TutorModelId,
  partId: string | null,
  lang: TutorLang,
  count: number,
  avoid: string[],
  assembling: boolean,
) {
  const response = await client.beta.messages.parse({
    model: args.teacher,
    max_tokens: 16000,
    // Server-side fallback is not offered for every teacher model.
    ...(args.teacher === 'claude-opus-5-5' && {
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default' as const,
    }),
    output_config: { effort: 'medium', format: betaZodOutputFormat(Batch) },
    messages: [{ role: 'user', content: teacherPrompt(model, partId, lang, count, avoid, assembling) }],
  })
  if (response.stop_reason === 'refusal') {
    console.warn(
      `  refused: ${model}/${partId ?? 'none'}/${lang} (${response.stop_details?.category ?? 'no category'})`,
    )
    return []
  }
  return response.parsed_output?.examples ?? []
}

interface Row {
  model: TutorModelId
  part: string | null
  lang: TutorLang
  /** Written for the assembly guide (the part is in the student's hand). */
  assembling: boolean
  kind: Example['kind']
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
}

const toRow = (
  model: TutorModelId,
  part: string | null,
  lang: TutorLang,
  assembling: boolean,
  ex: Example,
): Row => ({
  model,
  part,
  lang,
  assembling,
  kind: ex.kind,
  messages: [
    { role: 'system', content: systemPrompt(model, part, lang, assembling) },
    ...ex.history.flatMap((t) => [
      { role: 'user' as const, content: t.student },
      { role: 'assistant' as const, content: t.tutor },
    ]),
    { role: 'user', content: ex.student },
    { role: 'assistant', content: ex.tutor },
  ],
})

/** Runs jobs with at most `limit` in flight. */
async function pool<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = []
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++
      results[i] = await jobs[i]()
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results
}

const models = args.model ? TUTOR_MODELS.filter((m) => m === args.model) : [...TUTOR_MODELS]
const rounds = Number(args.rounds)
const tasks = models
  .flatMap((model) => {
    const parts: (string | null)[] = [...Object.keys(cards[model].parts), null]
    return parts.flatMap((part) => (['en', 'mn'] as const).map((lang) => ({ model, part, lang })))
  })
  .slice(0, args.limit ? Number(args.limit) : undefined)

const readRows = (file: string): Row[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Row)
    : []
const rows: Row[] = args.resume ? [...readRows(`${OUT}/train.jsonl`), ...readRows(`${OUT}/eval.jsonl`)] : []
if (args.resume) console.log(`Resuming with ${rows.length} examples`)

const sameTask = (r: Row, t: (typeof tasks)[number], assembling: boolean) =>
  r.model === t.model && r.part === t.part && r.lang === t.lang && !!r.assembling === assembling
const perRequest = (part: string | null) => (part ? 14 : 10)
// Once the account cannot pay, every further request fails the same way, so stop asking.
let stopped = false

// Even rounds: questions while exploring. Odd rounds: the assembly guide, with the part in hand.
for (let round = 0; round < rounds && !stopped; round++) {
  const assembling = round % 2 === 1
  const pass = Math.floor(round / 2) + 1
  // A (part, language) pair is done for this round once it has most of the examples the round asks for.
  const todo = tasks.filter(
    (t) =>
      (!assembling || t.part !== null) &&
      rows.filter((r) => sameTask(r, t, assembling)).length < 0.8 * perRequest(t.part) * pass,
  )
  console.log(`Round ${round + 1}/${rounds}: ${todo.length} requests`)
  const batches = await pool(
    todo.map((t) => async () => {
      if (stopped) return []
      const avoid = rows.filter((r) => sameTask(r, t, assembling)).map((r) => r.messages.at(-2)!.content)
      try {
        const examples = await generate(t.model, t.part, t.lang, perRequest(t.part), avoid, assembling)
        console.log(
          `  ${t.model}/${t.part ?? 'none'}/${t.lang}${assembling ? ' (guide)' : ''}: ${examples.length}`,
        )
        return examples.map((ex) => toRow(t.model, t.part, t.lang, assembling, ex))
      } catch (error) {
        if (!(error instanceof Anthropic.APIError)) throw error
        console.warn(
          `  API error ${error.status}: ${t.model}/${t.part ?? 'none'}/${t.lang}: ${error.message}`,
        )
        if (/credit balance/i.test(error.message)) stopped = true
        return []
      }
    }),
    Number(args.concurrency),
  )
  rows.push(...batches.flat())
}
if (stopped)
  console.warn(
    'Stopped early: the Anthropic account is out of credits. Add credits, then rerun with --resume.',
  )

// Random examples are held out, not whole parts: eval measures new questions about known parts,
// which is what students ask.
const shuffled = rows
  .map((r) => ({ r, k: Math.random() }))
  .sort((a, b) => a.k - b.k)
  .map(({ r }) => r)
const evalCount = Math.round(shuffled.length * EVAL_SHARE)
const evalRows = shuffled.slice(0, evalCount)
const trainRows = shuffled.slice(evalCount)

mkdirSync(OUT, { recursive: true })
const jsonl = (list: Row[]) => list.map((r) => JSON.stringify(r)).join('\n') + '\n'
writeFileSync(`${OUT}/train.jsonl`, jsonl(trainRows))
writeFileSync(`${OUT}/eval.jsonl`, jsonl(evalRows))

// 100 random examples for the team to read before training.
const review = shuffled.slice(0, 100).map((r, i) => {
  const turns = r.messages
    .slice(1)
    .map((m) => `**${m.role === 'user' ? 'Student' : 'Tutor'}:** ${m.content}`)
    .join('\n\n')
  return `### ${i + 1}. ${r.model} · ${r.part ?? 'no part'} · ${r.lang} · ${r.kind}\n\n${turns}\n`
})
writeFileSync(
  `${OUT}/review.md`,
  `# Tutor dataset review sample\n\nFix wrong facts in api/_lib/tutor/knowledge.ts, not here, then rebuild.\n\n${review.join('\n')}`,
)

console.log(`Wrote ${trainRows.length} train and ${evalRows.length} eval examples to ${OUT}/`)
