// What the controller is doing with two hands right now, for the hand overlay to draw.
// A plain mutable object: written every frame by the controller, read every frame by HandLayer.

export interface GestureHud {
  two: { kind: 'explode' | 'scale' | 'stretch'; a: string; b: string } | null
}

export const gestureHud: GestureHud = { two: null }
