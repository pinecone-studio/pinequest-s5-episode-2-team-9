// Scores the base Gemma and the fine-tuned tutor on the held-out questions, using eval_outputs.jsonl from the
// Kaggle notebook (training/hologemma-tutor.ipynb). A judge model sees the system prompt (the facts), the
// question, the reference answer and one candidate answer at a time, without knowing which model wrote it.
//
// Needs ANTHROPIC_API_KEY, or GEMINI_API_KEY with a gemini-* judge.
//
// Usage: npx tsx scripts/judge-tutor-eval.ts path/to/eval_outputs.jsonl [judge model, default claude-opus-5-5]
// Output: training/results.md (the before/after table)
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

interface Output {
  model: string
  part: string | null
  lang: 'en' | 'mn'
  kind: string
  messages: { role: string; content: string }[]
  reference: string
  base: string
  tuned: string
}

const Score = z.object({
  /** 0–2: wrong or invented facts / mostly right / fully supported by the facts. */
  grounded: z.number().int().min(0).max(2),
  /** Written in the language the system prompt asks for. */
  rightLanguage: z.boolean(),
  /** Short, friendly, school level, follows the safety and off-topic rules. */
  followsRules: z.boolean(),
})
type Score = z.infer<typeof Score>

const file = process.argv[2]
if (!file) throw new Error('Usage: npx tsx scripts/judge-tutor-eval.ts path/to/eval_outputs.jsonl')
const outputs: Output[] = readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Output)

const judgeModel = process.argv[3] ?? 'claude-opus-5-5'
const client = new Anthropic()

function gradePrompt(o: Output, candidate: string) {
  const [system, ...turns] = o.messages
  return `Grade a tutor's answer. The tutor was given this system prompt, which holds all the facts it may use:

<system_prompt>
${system.content}
</system_prompt>

<conversation>
${turns.map((t) => `${t.role === 'user' ? 'Student' : 'Tutor'}: ${t.content}`).join('\n')}
</conversation>

<reference_answer>
${o.reference}
</reference_answer>

<candidate_answer>
${candidate}
</candidate_answer>

grounded: 2 if every claim in the candidate is supported by the system prompt or is basic school science consistent with it and it answers the question; 1 if mostly right with a small error or gap; 0 if it invents facts, contradicts the system prompt, or misses the question.
rightLanguage: true if it is written in the language the system prompt asks for.
followsRules: true if it is 2–5 short sentences at school level and follows the prompt's rules (no diagnosis, declines off-topic questions).`
}

/** Gemini's OpenAI-compatible endpoint, retried while the free tier is rate-limited. */
async function judgeWithGemini(prompt: string): Promise<Score> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
      body: JSON.stringify({
        model: judgeModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'score', schema: z.toJSONSchema(Score) } },
      }),
    })
    if ((response.status === 429 || response.status === 503) && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 15_000 * (attempt + 1)))
      continue
    }
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`)
    const body = (await response.json()) as { choices: { message: { content: string } }[] }
    return Score.parse(JSON.parse(body.choices[0].message.content))
  }
}

async function judge(o: Output, candidate: string): Promise<Score | null> {
  if (judgeModel.startsWith('gemini')) return judgeWithGemini(gradePrompt(o, candidate))
  const response = await client.beta.messages.parse({
    model: judgeModel,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Score) },
    messages: [{ role: 'user', content: gradePrompt(o, candidate) }],
  })
  return response.stop_reason === 'refusal' ? null : response.parsed_output
}

const scored: { o: Output; base: Score | null; tuned: Score | null }[] = []
for (const [i, o] of outputs.entries()) {
  const [base, tuned] = await Promise.all([judge(o, o.base), judge(o, o.tuned)])
  scored.push({ o, base, tuned })
  if (i % 10 === 0) console.log(`${i + 1}/${outputs.length}`)
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '–')
function row(label: string, list: typeof scored) {
  const cols = (pick: 'base' | 'tuned') => {
    const s = list.map((x) => x[pick]).filter((x): x is Score => x !== null)
    return [
      pct(s.filter((x) => x.grounded === 2).length, s.length),
      pct(s.filter((x) => x.rightLanguage).length, s.length),
      pct(s.filter((x) => x.followsRules).length, s.length),
    ]
  }
  const [b, t] = [cols('base'), cols('tuned')]
  return `| ${label} | ${list.length} | ${b[0]} → **${t[0]}** | ${b[1]} → **${t[1]}** | ${b[2]} → **${t[2]}** |`
}

const groups = [
  ['All', scored],
  ...(['en', 'mn'] as const).map((l) => [l, scored.filter((x) => x.o.lang === l)] as const),
  ...[...new Set(scored.map((x) => x.o.model))].map(
    (m) => [m, scored.filter((x) => x.o.model === m)] as const,
  ),
] as const

const table = [
  '| Questions | n | Fully grounded (base → tuned) | Right language | Follows rules |',
  '|---|---|---|---|---|',
  ...groups.map(([label, list]) => row(label, list)),
].join('\n')

writeFileSync(
  'training/results.md',
  `# Tutor eval: base Gemma vs fine-tuned\n\nHeld-out student questions from ${file}, graded by ${judgeModel} without knowing which model answered.\n\n${table}\n`,
)
console.log(table)
