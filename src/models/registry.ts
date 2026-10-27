// The model library. Adding a model = a GLB, a definition, an entry here, and its texts.
import { brain } from './brain/definition'
import { electricMotor } from './electricMotor/definition'
import { heart } from './heart/definition'
import type { ModelDefinition } from './ModelDefinition'
import { robotDog } from './robotDog/definition'
import { rocketEngine } from './rocketEngine/definition'
import { skeleton } from './skeleton/definition'

export const library: ModelDefinition[] = [heart, brain, skeleton, robotDog, rocketEngine, electricMotor]

export function modelBySlug(slug: string): ModelDefinition | undefined {
  return library.find((m) => m.slug === slug)
}
