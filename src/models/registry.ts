// The model library. Adding a model = a GLB, a definition, an entry here, and its texts.
import { brain } from './brain/definition'
import { computer } from './computer/definition'
import { electricMotor } from './electricMotor/definition'
import { heart } from './heart/definition'
import { lungs } from './lungs/definition'
import { muscles } from './muscles/definition'
import type { ModelDefinition } from './ModelDefinition'
import { robotDog } from './robotDog/definition'
import { rocketEngine } from './rocketEngine/definition'
import { skeleton } from './skeleton/definition'

export const library: ModelDefinition[] = [
  heart,
  lungs,
  brain,
  skeleton,
  muscles,
  robotDog,
  rocketEngine,
  electricMotor,
  computer,
]

export function modelBySlug(slug: string): ModelDefinition | undefined {
  return library.find((m) => m.slug === slug)
}

/** Labs that are not take-apart models (own scene and panel). */
export interface Experience {
  id: 'atoms' | 'solar' | 'electromagnetism' | 'spacetime'
  slug: string
  accent: string
  titleKey: string
  summaryKey: string
  /** Short "what's inside" line on the library card. */
  metaKey: string
}

export const experiences: Experience[] = [
  {
    id: 'atoms',
    slug: 'atoms',
    accent: '#5ee7ff',
    titleKey: 'atoms.title',
    summaryKey: 'atoms.summary',
    metaKey: 'atoms.meta',
  },
  {
    id: 'solar',
    slug: 'solar-system',
    accent: '#ffcf6b',
    titleKey: 'solar.title',
    summaryKey: 'solar.summary',
    metaKey: 'solar.meta',
  },
  {
    id: 'electromagnetism',
    slug: 'electromagnetism',
    accent: '#7c9cff',
    titleKey: 'electromagnetism.title',
    summaryKey: 'electromagnetism.summary',
    metaKey: 'electromagnetism.meta',
  },
  {
    id: 'spacetime',
    slug: 'spacetime',
    accent: '#c58cff',
    titleKey: 'spacetime.title',
    summaryKey: 'spacetime.summary',
    metaKey: 'spacetime.meta',
  },
]

export function experienceBySlug(slug: string): Experience | undefined {
  return experiences.find((e) => e.slug === slug)
}
