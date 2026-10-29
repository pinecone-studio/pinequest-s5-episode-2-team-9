// Values shared between the 3D scene and DOM overlays.

/** Screen position of the hovered/selected part, written by the scene every frame. */
export const labelAnchor = { x: 0, y: 0, visible: false }

/** Screen position of the opening the guided part attaches to, during assembly. */
export const guideAnchor = { x: 0, y: 0, visible: false }

/**
 * Study close-up of a part: one entry per socket or opening on it, named by the part that plugs in
 * there. Rewritten by the scene every frame; `ids` changes only when the studied part changes.
 */
export const portAnchors: { ids: string[]; at: Map<string, { x: number; y: number }> } = {
  ids: [],
  at: new Map(),
}

/** Width reserved for the side panel when laying out the model (px). */
export const PANEL_PX = 380
