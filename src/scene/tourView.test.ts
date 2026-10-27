import { describe, expect, it } from 'vitest'
import { Euler, Vector3 } from 'three'
import { faceAngles, MAX_PITCH } from './tourView'

const apply = (angles: [number, number, number], v: Vector3) => v.clone().applyEuler(new Euler(...angles))

describe('faceAngles', () => {
  it('turns a part on the right towards the camera', () => {
    const a = faceAngles(1, 0, 0, 1)!
    const out = apply(a, new Vector3(1, 0, 0))
    expect(out.z).toBeGreaterThan(0.9)
    expect(Math.abs(out.x)).toBeLessThan(1e-9)
  })

  it('turns a part at the back around', () => {
    const out = apply(faceAngles(0, 0, -1, 1)!, new Vector3(0, 0, -1))
    expect(out.z).toBeGreaterThan(0.9)
  })

  it('keeps the pitch within limits for parts straight above or below', () => {
    for (const dy of [1, -1]) {
      const [pitch] = faceAngles(0.01, dy, 0.01, 1)!
      expect(Math.abs(pitch)).toBeLessThanOrEqual(MAX_PITCH)
    }
  })

  it('leaves parts at the centre alone', () => {
    expect(faceAngles(0, 0.05, 0, 1)).toBeNull()
    expect(faceAngles(0, 0, 0, 1)).toBeNull()
  })
})
