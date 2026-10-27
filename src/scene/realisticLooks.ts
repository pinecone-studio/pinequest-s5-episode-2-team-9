// Physically based material presets for the "Realistic" view.
import { Color, DoubleSide, MeshPhysicalMaterial } from 'three'

export interface LookPreset {
  color: string
  metalness?: number
  roughness?: number
  clearcoat?: number
  clearcoatRoughness?: number
  sheen?: number
  sheenColor?: string
  /** Partly see-through (fluid, membranes). */
  opacity?: number
  /** Self-lit glow (hot metal, LEDs). */
  emissive?: string
}

export const LOOKS = {
  myocardium: { color: '#6a1219', roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.5, sheenColor: '#ff7a7a' },
  septum: { color: '#5e1219', roughness: 0.5, clearcoat: 0.4, sheen: 0.4, sheenColor: '#ff8a8a' },
  artery: { color: '#8c1c26', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 },
  vein: { color: '#382a72', roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 },
  valve: { color: '#e9d6b4', roughness: 0.55, clearcoat: 0.4, sheen: 0.3, sheenColor: '#fff2dc' },
  papillary: { color: '#8a3036', roughness: 0.5, clearcoat: 0.4 },
  coronaryArtery: { color: '#a8222c', roughness: 0.35, clearcoat: 0.8 },
  coronaryVein: { color: '#45358a', roughness: 0.38, clearcoat: 0.7 },
  greyMatter: { color: '#d6a59d', roughness: 0.62, clearcoat: 0.25, sheen: 0.6, sheenColor: '#ffd6cf' },
  deepNucleus: { color: '#c48b84', roughness: 0.6, clearcoat: 0.2, sheen: 0.4, sheenColor: '#ffd0c8' },
  whiteMatter: { color: '#efe2d6', roughness: 0.6, clearcoat: 0.2, sheen: 0.3, sheenColor: '#ffffff' },
  csf: { color: '#8fd0ff', roughness: 0.1, clearcoat: 1, opacity: 0.55 },
  nerve: { color: '#f3e6b0', roughness: 0.5, clearcoat: 0.3 },
  bone: { color: '#e6dcc5', roughness: 0.72, clearcoat: 0.15, sheen: 0.2, sheenColor: '#fff8e8' },
  cartilage: { color: '#cfe1e6', roughness: 0.4, clearcoat: 0.5, opacity: 0.85 },
  boneFaint: { color: '#c9c1ae', roughness: 0.75, opacity: 0.35 },
  muscle: { color: '#9e2329', roughness: 0.48, clearcoat: 0.45, clearcoatRoughness: 0.35, sheen: 0.6, sheenColor: '#ff8f8f' },
  muscleDeep: { color: '#86202a', roughness: 0.5, clearcoat: 0.35, sheen: 0.5, sheenColor: '#ff8f8f' },
  steel: { color: '#b9c0c8', metalness: 1, roughness: 0.3 },
  darkMetal: { color: '#3b4048', metalness: 0.9, roughness: 0.42 },
  aluminium: { color: '#d4d8dc', metalness: 1, roughness: 0.38 },
  copper: { color: '#c87a45', metalness: 1, roughness: 0.28 },
  hotCopper: { color: '#b86a3a', metalness: 1, roughness: 0.42, emissive: '#3a0d00' },
  niobium: { color: '#6e6863', metalness: 1, roughness: 0.48 },
  gold: { color: '#d6a54a', metalness: 1, roughness: 0.3 },
  plasticWhite: { color: '#d7dbe0', roughness: 0.5, clearcoat: 0.3 },
  plasticGrey: { color: '#8a9099', roughness: 0.55, clearcoat: 0.2 },
  plasticBlack: { color: '#1c1e22', roughness: 0.6, clearcoat: 0.25 },
  plasticBlue: { color: '#2f5fb0', roughness: 0.45, clearcoat: 0.3 },
  pcb: { color: '#1e6b3c', roughness: 0.55, metalness: 0.1, clearcoat: 0.6 },
  rubber: { color: '#202326', roughness: 0.92 },
  carbon: { color: '#2b2b2f', roughness: 0.85 },
  magnetNorth: { color: '#a8323a', metalness: 0.6, roughness: 0.35 },
  magnetSouth: { color: '#2f4f9a', metalness: 0.6, roughness: 0.35 },
  ironLamination: { color: '#5d646d', metalness: 0.85, roughness: 0.5 },
  oxygenLine: { color: '#9cc9e8', metalness: 0.9, roughness: 0.32 },
  servo: { color: '#2a2c31', roughness: 0.5, clearcoat: 0.3 },
  battery: { color: '#2f5fb0', roughness: 0.4, clearcoat: 0.4 },
  chassisSteel: { color: '#2b2f36', metalness: 0.55, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35 },
  glass: { color: '#cfe6f2', roughness: 0.04, clearcoat: 0.4, clearcoatRoughness: 0.02, opacity: 0.08 },
  nickel: { color: '#cfc9c0', metalness: 1, roughness: 0.2 },
  dimmBlack: { color: '#15171c', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 },
  pcbDark: { color: '#1a1e1c', metalness: 0.15, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3 },
  substrate: { color: '#2c5b3c', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 },
  chip: { color: '#121316', roughness: 0.62 },
  brushedSteel: { color: '#a9aeb3', metalness: 1, roughness: 0.45 },
  sleeve: { color: '#16181b', roughness: 0.82, sheen: 0.7, sheenColor: '#5a6068' },
  label: { color: '#c4c8cc', roughness: 0.75 },
  labelDark: { color: '#2a2d33', roughness: 0.6 },
  ledWhite: { color: '#bfe6f5', roughness: 0.3, emissive: '#2a6f8c' },
  jackGreen: { color: '#3fae5a', roughness: 0.45, clearcoat: 0.3 },
  jackPink: { color: '#e07aa7', roughness: 0.45, clearcoat: 0.3 },
} satisfies Record<string, LookPreset>

export type LookId = keyof typeof LOOKS

export function createRealisticMaterial(look: LookId): MeshPhysicalMaterial {
  const p: LookPreset = LOOKS[look]
  const m = new MeshPhysicalMaterial({
    color: new Color(p.color),
    metalness: p.metalness ?? 0,
    roughness: p.roughness ?? 0.5,
    clearcoat: p.clearcoat ?? 0,
    clearcoatRoughness: p.clearcoatRoughness ?? 0.3,
    sheen: p.sheen ?? 0,
    sheenColor: new Color(p.sheenColor ?? '#ffffff'),
    emissive: new Color(p.emissive ?? '#000000'),
    side: DoubleSide,
    transparent: true,
    opacity: p.opacity ?? 1,
    depthWrite: (p.opacity ?? 1) >= 1,
  })
  m.userData.baseOpacity = p.opacity ?? 1
  m.userData.baseColor = new Color(p.color)
  m.userData.baseEmissive = new Color(p.emissive ?? '#000000')
  return m
}
