// The tutor's system prompt. The fine-tuning data (training/) and the live endpoint (api/ask.ts) both
// build it here, so the model sees in production exactly the format it was trained on.
import { cards, type TutorCard } from './cards.js'
import { knowledge, type Connection, type TutorModelId } from './knowledge.js'

export type TutorLang = 'en' | 'mn'

/** Part ids are written as their English names, so the model never sees ids like `atx_cable`. */
function nameOf(model: TutorModelId, id: string): string {
  const parts = cards[model].parts
  return (parts[id] ?? Object.values(parts).find((p) => p.info === id))?.en.name ?? id
}

const connectionLine = (model: TutorModelId, c: Connection) =>
  `- ${nameOf(model, c.to)}: ${nameOf(model, c.via)}${c.detail ? ` (${c.detail})` : ''}`

/** Everything the tutor may use about one part, as plain text. */
export function partContext(model: TutorModelId, partId: string, lang: TutorLang): string {
  const card: TutorCard | undefined = cards[model].parts[partId]
  if (!card) return ''
  const info = knowledge[model][card.info]
  const text = card[lang]
  const lines = [
    `Part: ${card.en.name}${lang === 'mn' ? ` (${text.name})` : ''}`,
    `Group: ${text.group}`,
    `Card: ${text.desc}`,
  ]
  if (text.fact) lines.push(`Fact: ${text.fact}`)
  // Assembly order is real build order for the computer; for anatomy it is only how the lab rebuilds it.
  if (model === 'computer' && card.dependsOn.length) {
    lines.push(`Build order: goes in after ${card.dependsOn.map((d) => nameOf(model, d)).join(', ')}`)
  }
  if (info?.connections.length)
    lines.push('Connections:', ...info.connections.map((c) => connectionLine(model, c)))
  if (info?.conditions?.length) lines.push('Conditions:', ...info.conditions.map((c) => `- ${c}`))
  if (info?.notes?.length) lines.push('Notes:', ...info.notes.map((n) => `- ${n}`))
  return lines.join('\n')
}

const ROLE = {
  heart: 'a human heart',
  computer: 'a desktop computer (ATX build)',
} satisfies Record<TutorModelId, string>

/** What the assembly guide adds: the student is fitting this part right now. */
function assemblyContext(model: TutorModelId, partId: string): string {
  const card = cards[model].parts[partId]
  const before = card.dependsOn.map((d) => nameOf(model, d))
  return [
    `The student is rebuilding the model and has this part in hand. It attaches to: ${nameOf(model, card.dependsOn[0] ?? partId)}.`,
    before.length ? `It can only go in after: ${before.join(', ')}.` : '',
    'Guide them like a teacher standing beside them: say exactly where it goes (the opening, socket or slot) and why. If they ask why it does not fit yet, name what must be in place first.',
  ]
    .filter(Boolean)
    .join(' ')
}

/** The system prompt for one model, optionally focused on the part the student selected (or is fitting). */
export function systemPrompt(
  model: TutorModelId,
  partId: string | null,
  lang: TutorLang,
  assembling = false,
): string {
  const all = Object.values(cards[model].parts).map((p) => p.en.name)
  const names = [...new Set(all)].join(', ')
  return [
    `You are Hologemma, a tutor inside a 3D science lab for students aged 14–18. The student is exploring ${ROLE[model]}.`,
    `Answer in ${lang === 'mn' ? 'Mongolian (Cyrillic)' : 'English'}, in 2–5 short sentences, clear and friendly, as plain text (no markdown, no bold, no lists). Use the facts below; if the answer is not in them and you are not sure, say so.`,
    model === 'heart'
      ? 'Medical questions: explain at school level and never diagnose. If the student describes their own symptoms, tell them to see a doctor.'
      : 'Connection questions: name the exact connector or slot and where it sits.',
    'Only answer questions about this model or closely related science; politely decline anything else.',
    `Parts in this model: ${names}.`,
    partId && cards[model].parts[partId]
      ? `The student selected this part:\n${partContext(model, partId, lang)}`
      : 'No part is selected.',
    ...(assembling && partId && cards[model].parts[partId] ? [assemblyContext(model, partId)] : []),
  ].join('\n\n')
}
