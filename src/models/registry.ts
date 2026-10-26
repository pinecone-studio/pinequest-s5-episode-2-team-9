// The model library. Adding a model = a GLB, a definition, an entry here, and its texts.
import { brain } from './brain/definition'
import { heart } from './heart/definition'
import type { ModelDefinition } from './ModelDefinition'
import { robotDog } from './robotDog/definition'

export const library: ModelDefinition[] = [heart, brain, robotDog]

export function modelBySlug(slug: string): ModelDefinition | undefined {
  return library.find((m) => m.slug === slug)
}
