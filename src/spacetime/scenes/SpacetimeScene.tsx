import { useEffect } from 'react'
import { useLab } from '../../lab/labStore'
import { useSpacetime } from '../spacetimeStore'
import { AppleScene } from './AppleScene'
import { GridScene } from './GridScene'
import { OrbitScene } from './OrbitScene'
import { SheetScene } from './SheetScene'

/** The 3D side of the spacetime lab: one scene per view. */
export function SpacetimeScene() {
  const view = useSpacetime((s) => s.view)
  const sheet = useSpacetime((s) => s.sheet)
  // Real bodies and a real apple: post effects in their realistic mode (no hologram fringing).
  useEffect(() => {
    useLab.getState().set({ forcedRealistic: true })
    return () => useLab.getState().set({ forcedRealistic: false })
  }, [])
  if (view === 'apple') return <AppleScene />
  if (view === 'orbits') return <OrbitScene />
  return sheet ? <SheetScene /> : <GridScene />
}
