import { Color } from 'three'
import type { PartRig } from '../modelRig'

const tmp = new Color()

/** Adds extra glow to a part this frame, in whichever material is showing. */
export function glowPart(part: PartRig, amount: number): void {
  if (amount <= 0) return
  if (part.mesh.material === part.holo) part.holo.uniforms.uHighlight.value += amount
  else {
    tmp.set(part.def.color).multiplyScalar(0.3 * amount)
    for (const m of part.reals) m.emissive.add(tmp)
  }
}
