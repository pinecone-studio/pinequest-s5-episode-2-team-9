import { useEffect } from 'react'
import { useLab } from '../../lab/labStore'
import { useSolar } from '../solarStore'
import { EarthScene } from './EarthScene'
import { MoonScene } from './MoonScene'
import { SolarClock } from './shared'
import { SystemScene } from './SystemScene'

/** The 3D side of the solar system lab: one scene per view, one shared clock. */
export function SolarScene() {
  const view = useSolar((s) => s.view)
  // Real bodies: post effects in their realistic mode (no hologram fringing).
  useEffect(() => {
    useLab.getState().set({ forcedRealistic: true })
    return () => useLab.getState().set({ forcedRealistic: false })
  }, [])
  return (
    <>
      <SolarClock />
      {view === 'system' && <SystemScene />}
      {view === 'earth' && <EarthScene />}
      {view === 'moon' && <MoonScene />}
    </>
  )
}
