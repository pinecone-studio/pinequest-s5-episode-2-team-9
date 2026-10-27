// Hydrogen emission lines and wavelength → visible colour.

/** Rydberg constant for hydrogen, per nanometre. */
export const RYDBERG_H = 1.09677583e-2

/** Wavelength (nm) of the photon emitted when an electron falls from level nUpper to nLower. */
export function emissionWavelengthNm(nUpper: number, nLower: number): number {
  if (nUpper <= nLower) throw new Error('nUpper must be above nLower')
  return 1 / (RYDBERG_H * (1 / (nLower * nLower) - 1 / (nUpper * nUpper)))
}

export type Band = 'ultraviolet' | 'visible' | 'infrared'

export function band(nm: number): Band {
  return nm < 380 ? 'ultraviolet' : nm > 750 ? 'infrared' : 'visible'
}

export const SERIES: Record<number, string> = {
  1: 'Lyman',
  2: 'Balmer',
  3: 'Paschen',
  4: 'Brackett',
  5: 'Pfund',
}

/**
 * Approximate sRGB colour of a wavelength (Dan Bruton's piecewise fit),
 * with intensity falling off at the edges of vision. Outside 380–750 nm
 * returns a dim marker colour (UV violet-grey, IR dark red).
 */
export function wavelengthToRgb(nm: number): [number, number, number] {
  if (nm < 380) return [0.45, 0.35, 0.6]
  if (nm > 750) return [0.45, 0.12, 0.12]
  let r = 0
  let g = 0
  let b = 0
  if (nm < 440) {
    r = -(nm - 440) / (440 - 380)
    b = 1
  } else if (nm < 490) {
    g = (nm - 440) / (490 - 440)
    b = 1
  } else if (nm < 510) {
    g = 1
    b = -(nm - 510) / (510 - 490)
  } else if (nm < 580) {
    r = (nm - 510) / (580 - 510)
    g = 1
  } else if (nm < 645) {
    r = 1
    g = -(nm - 645) / (645 - 580)
  } else {
    r = 1
  }
  const edge =
    nm < 420 ? 0.3 + (0.7 * (nm - 380)) / (420 - 380) : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / (750 - 700) : 1
  return [r * edge, g * edge, b * edge]
}

export const rgbCss = ([r, g, b]: [number, number, number]) =>
  `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
