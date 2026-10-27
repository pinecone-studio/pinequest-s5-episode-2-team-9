// The model library. Adding a model = a GLB, a definition, an entry here, and its texts.
import { brain } from './brain/definition'
import { computer } from './computer/definition'
import { electricMotor } from './electricMotor/definition'
import { heart } from './heart/definition'
import { muscles } from './muscles/definition'
import type { ModelDefinition } from './ModelDefinition'
import { robotDog } from './robotDog/definition'
import { rocketEngine } from './rocketEngine/definition'
import { skeleton } from './skeleton/definition'

export const library: ModelDefinition[] = [heart, brain, skeleton, muscles, robotDog, rocketEngine, electricMotor, computer]

export function modelBySlug(slug: string): ModelDefinition | undefined {
  return library.find((m) => m.slug === slug)
}

/** Labs that are not take-apart models (own scene and panel). */
export interface Experience {
  id: 'atoms'
  slug: string
  accent: string
  titleKey: string
  summaryKey: string
}

export const experiences: Experience[] = [
  { id: 'atoms', slug: 'atoms', accent: '#5ee7ff', titleKey: 'atoms.title', summaryKey: 'atoms.summary' },
]

export function experienceBySlug(slug: string): Experience | undefined {
  return experiences.find((e) => e.slug === slug)
}
