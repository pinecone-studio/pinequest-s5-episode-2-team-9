import { Color } from 'three'
import type { PieceDef } from '../models/ModelDefinition'

/** Hologram tints of sibling pieces: their own colour, or the parent's with hue and lightness varied. */
export function pieceColors(parentColor: string, defs: PieceDef[]): Color[] {
  const infos = [...new Set(defs.map((d) => d.info ?? d.id))]
  return defs.map((d, i) => {
    if (d.color) return new Color(d.color)
    // Numbered copies (lobules, rings) vary by number; distinct structures by kind.
    const k = infos.length > 1 ? infos.indexOf(d.info ?? d.id) : i
    const n = infos.length > 1 ? infos.length : defs.length
    return new Color(parentColor).offsetHSL((k / Math.max(1, n - 1) - 0.5) * 0.22, 0, ((k % 3) - 1) * 0.06)
  })
}

/** Colour of the node at `path` below a part (for the panel's swatches). */
export function pieceColorAt(partColor: string, pieces: PieceDef[] | undefined, path: readonly string[]): string {
  let color = partColor
  let level = pieces ?? []
  for (const id of path) {
    const i = level.findIndex((p) => p.id === id)
    if (i < 0) break
    color = `#${pieceColors(color, level)[i].getHexString()}`
    level = level[i].pieces ?? []
  }
  return color
}
