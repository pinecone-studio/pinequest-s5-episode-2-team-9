// The first 20 elements: enough for every atom a high-school student builds,
// and their shells fill neatly (2, 8, 8, 2).

export interface ElementInfo {
  z: number
  symbol: string
  /** Stable isotopes by mass number. */
  stable: number[]
  /** Group and period in the periodic table. */
  group: number
  period: number
}

export const ELEMENTS: ElementInfo[] = [
  { z: 1, symbol: 'H', stable: [1, 2], group: 1, period: 1 },
  { z: 2, symbol: 'He', stable: [3, 4], group: 18, period: 1 },
  { z: 3, symbol: 'Li', stable: [6, 7], group: 1, period: 2 },
  { z: 4, symbol: 'Be', stable: [9], group: 2, period: 2 },
  { z: 5, symbol: 'B', stable: [10, 11], group: 13, period: 2 },
  { z: 6, symbol: 'C', stable: [12, 13], group: 14, period: 2 },
  { z: 7, symbol: 'N', stable: [14, 15], group: 15, period: 2 },
  { z: 8, symbol: 'O', stable: [16, 17, 18], group: 16, period: 2 },
  { z: 9, symbol: 'F', stable: [19], group: 17, period: 2 },
  { z: 10, symbol: 'Ne', stable: [20, 21, 22], group: 18, period: 2 },
  { z: 11, symbol: 'Na', stable: [23], group: 1, period: 3 },
  { z: 12, symbol: 'Mg', stable: [24, 25, 26], group: 2, period: 3 },
  { z: 13, symbol: 'Al', stable: [27], group: 13, period: 3 },
  { z: 14, symbol: 'Si', stable: [28, 29, 30], group: 14, period: 3 },
  { z: 15, symbol: 'P', stable: [31], group: 15, period: 3 },
  { z: 16, symbol: 'S', stable: [32, 33, 34, 36], group: 16, period: 3 },
  { z: 17, symbol: 'Cl', stable: [35, 37], group: 17, period: 3 },
  { z: 18, symbol: 'Ar', stable: [36, 38, 40], group: 18, period: 3 },
  { z: 19, symbol: 'K', stable: [39, 41], group: 1, period: 4 },
  { z: 20, symbol: 'Ca', stable: [40, 42, 43, 44, 46, 48], group: 2, period: 4 },
]

export const MAX_Z = ELEMENTS.length

/** Electrons per shell for the simple shell (Bohr) model used in the builder. */
export const SHELL_CAPACITY = [2, 8, 8, 2]

export function shellFilling(electrons: number): number[] {
  const shells: number[] = []
  let left = electrons
  for (const cap of SHELL_CAPACITY) {
    if (left <= 0) break
    const n = Math.min(cap, left)
    shells.push(n)
    left -= n
  }
  return shells
}

export interface AtomStatus {
  element: ElementInfo | null
  massNumber: number
  charge: number
  /** 'stable', 'unstable', or 'none' when there are no protons. */
  stability: 'stable' | 'unstable' | 'none'
}

export function describeAtom(protons: number, neutrons: number, electrons: number): AtomStatus {
  const element = protons >= 1 && protons <= MAX_Z ? ELEMENTS[protons - 1] : null
  const massNumber = protons + neutrons
  return {
    element,
    massNumber,
    charge: protons - electrons,
    stability: !element ? 'none' : element.stable.includes(massNumber) ? 'stable' : 'unstable',
  }
}
