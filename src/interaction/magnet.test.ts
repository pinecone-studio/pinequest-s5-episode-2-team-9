import { describe, expect, it } from 'vitest'
import type { ModelDefinition, PartDef } from '../models/ModelDefinition'
import { jointOf, magnetPull, pairPlaceable, SNAP_PULL } from './magnet'

const part = (id: string, dependsOn: string[] = []): PartDef => ({ id, group: 'g', color: '#fff', dependsOn })

const def = {
  baseParts: ['septum'],
  parts: [
    part('septum'),
    part('ventricle', ['septum']),
    part('atrium', ['ventricle']),
    part('valve', ['atrium', 'ventricle']),
  ],
} as unknown as ModelDefinition

describe('magnetPull', () => {
  it('is 0 outside the radius and 1 at the opening', () => {
    expect(magnetPull(120, 100)).toBe(0)
    expect(magnetPull(100, 100)).toBe(0)
    expect(magnetPull(0, 100)).toBe(1)
  })

  it('grows as the part gets closer, and snaps only near the opening', () => {
    const far = magnetPull(80, 100)
    const mid = magnetPull(50, 100)
    const near = magnetPull(15, 100)
    expect(far).toBeLessThan(mid)
    expect(mid).toBeLessThan(near)
    expect(mid).toBeLessThan(SNAP_PULL)
    expect(near).toBeGreaterThanOrEqual(SNAP_PULL)
  })
})

describe('jointOf', () => {
  it('finds the parent in either order', () => {
    expect(jointOf(def, 'ventricle', 'atrium')).toEqual({ parent: 'ventricle', child: 'atrium' })
    expect(jointOf(def, 'atrium', 'ventricle')).toEqual({ parent: 'ventricle', child: 'atrium' })
  })

  it('refuses parts that do not attach directly', () => {
    expect(jointOf(def, 'septum', 'atrium')).toBeNull()
    expect(jointOf(def, 'atrium', 'atrium')).toBeNull()
  })
})

describe('pairPlaceable', () => {
  it('needs the parent placeable and the child to need nothing but the parent', () => {
    expect(pairPlaceable(def, ['septum'], 'ventricle', 'atrium')).toBe(true)
    expect(pairPlaceable(def, [], 'ventricle', 'atrium')).toBe(false)
    // The valve also needs the ventricle, which is neither placed nor in the pair.
    expect(pairPlaceable(def, ['septum'], 'atrium', 'valve')).toBe(false)
    expect(pairPlaceable(def, ['septum', 'ventricle'], 'atrium', 'valve')).toBe(true)
  })
})
