import { useEffect } from 'react'
import { useLab } from '../../lab/labStore'
import { useEm } from '../emStore'
import { CurrentScene } from './CurrentScene'
import { HopfionScene } from './HopfionScene'
import { LorentzScene } from './LorentzScene'
import { useEmControls } from './hooks'

/** The 3D side of the electromagnetism lab: one scene per view, sharing one set of view controls. */
export function EmScene() {
  const view = useEm((s) => s.view)
  const controls = useEmControls()
  // Real conductors and fields: post effects in their realistic mode (no hologram fringing).
  useEffect(() => {
    useLab.getState().set({ forcedRealistic: true })
    return () => useLab.getState().set({ forcedRealistic: false })
  }, [])
  if (view === 'lorentz') return <LorentzScene controls={controls} />
  if (view === 'hopfion') return <HopfionScene controls={controls} />
  return <CurrentScene controls={controls} />
}
