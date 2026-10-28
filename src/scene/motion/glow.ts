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

/** Fades a part this frame (k < 1), so what a motion draws inside it stands out. */
export function fadePart(part: PartRig, k: number): void {
  if (part.mesh.material === part.holo) part.holo.uniforms.uIntensity.value *= k
  else
    for (const m of part.reals) {
      m.transparent = true
      m.depthWrite = false
      m.opacity *= k
    }
}
