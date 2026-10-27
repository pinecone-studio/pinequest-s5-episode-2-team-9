// Pure view maths for guided tours (no three.js), so it is unit-tested in Node.

/** Largest tilt up or down, so the model never ends up upside down. */
export const MAX_PITCH = 0.5
/** A slight look from above, like the models' initial views. */
const PITCH_BIAS = 0.12

/**
 * Euler angles (XYZ, radians) that turn a part's direction from the model centre
 * towards the camera (+z). Returns null for parts too close to the centre to face.
 */
export function faceAngles(
  dx: number,
  dy: number,
  dz: number,
  radius: number,
): [number, number, number] | null {
  const len = Math.hypot(dx, dy, dz)
  if (!(len > radius * 0.12)) return null
  // Yaw about y brings the horizontal direction to +z; pitch about x then lifts it toward the camera.
  const yaw = Math.atan2(-dx, dz)
  const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + PITCH_BIAS
  return [Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch)), yaw, 0]
}
