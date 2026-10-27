// Muscles exported from Z-Anatomy (CC BY-SA 4.0) and aligned to BodyParts3D.
// Export step (Blender, scripts never auto-run): see scripts/export-zanatomy.sh.
// The two datasets differ slightly in scale and pose, so each body region gets
// its own per-axis fit, computed from bones present in both (≈1 mm RMS for the
// head, ≈5 mm for the trunk).
import { readFile } from 'node:fs/promises'
import { indexSoup, type MeshData } from './gltf'

export const ZANATOMY_EXPORT = 'scripts/.cache/zanatomy/export'
const FIT_FILE = 'scripts/.cache/zanatomy/fit.json'

export type Region = 'head' | 'trunk'

interface Fit {
  scale: [number, number, number]
  offset: [number, number, number]
}

let fits: Record<Region, Fit> | null = null

/** Loads one exported object, mapped into app space (metres, y-up, +z anterior). */
export async function loadZanatomy(name: string, region: Region): Promise<MeshData> {
  fits ??= JSON.parse(await readFile(FIT_FILE, 'utf8')) as Record<Region, Fit>
  const { scale: s, offset: t } = fits[region]
  const buf = await readFile(`${ZANATOMY_EXPORT}/${name}.f32`)
  const src = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const soup = new Float32Array(src.length)
  for (let i = 0; i < src.length; i += 3) {
    // Z-Anatomy metres → BodyParts3D millimetres (fitted) → app space.
    const x = s[0] * src[i] + t[0]
    const y = s[1] * src[i + 1] + t[1]
    const z = s[2] * src[i + 2] + t[2]
    soup[i] = x / 1000
    soup[i + 1] = z / 1000
    soup[i + 2] = -y / 1000
  }
  return indexSoup(soup)
}
