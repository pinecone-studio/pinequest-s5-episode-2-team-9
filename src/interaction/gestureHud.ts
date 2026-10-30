// What the controller is doing with two hands right now, for the hand overlay to draw.
// A plain mutable object: written every frame by the controller, read every frame by HandLayer.

export interface GestureHud {
  /** 'join': two hands working on the assembly; `pull` is the magnet's strength (0..1). */
  two: { kind: 'explode' | 'scale' | 'stretch' | 'join'; a: string; b: string; pull?: number } | null
}

export const gestureHud: GestureHud = { two: null }
